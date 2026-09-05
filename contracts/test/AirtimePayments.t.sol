// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AirtimePayments} from "../src/AirtimePayments.sol";
import {MockERC20} from "./MockERC20.sol";

contract RejectingTreasury {
    receive() external payable {
        revert("no");
    }
}

contract AirtimePaymentsTest is Test {
    AirtimePayments internal payments;
    MockERC20 internal token;

    uint256 internal signerKey = 0xA11CE;
    address internal signer;
    address internal owner = address(0xABCD);
    address internal treasury = address(0x7e5);
    uint256 internal buyerKey = 0xB0B;
    address internal buyer;
    address internal stranger = address(0x5710);

    function setUp() public {
        signer = vm.addr(signerKey);
        buyer = vm.addr(buyerKey);
        payments = new AirtimePayments(owner, signer, treasury);
        token = new MockERC20();
        vm.deal(buyer, 100 ether);
        vm.deal(stranger, 100 ether);
    }

    function _quote() internal view returns (AirtimePayments.Quote memory q) {
        q = AirtimePayments.Quote({
            quoteId: keccak256("quote-1"),
            buyer: buyer,
            placementId: keccak256("STUDIO_LEFT"),
            creativeHash: keccak256("creative-bytes"),
            startAt: uint64(block.timestamp + 600),
            endAt: uint64(block.timestamp + 1200),
            paymentToken: address(0),
            amount: 0.05 ether,
            expiresAt: uint64(block.timestamp + 180),
            nonce: 1
        });
    }

    function _sign(AirtimePayments.Quote memory q, uint256 key) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                payments.QUOTE_TYPEHASH(),
                q.quoteId,
                q.buyer,
                q.placementId,
                q.creativeHash,
                q.startAt,
                q.endAt,
                q.paymentToken,
                q.amount,
                q.expiresAt,
                q.nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", payments.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    // -----------------------------------------------------------------
    // Happy paths
    // -----------------------------------------------------------------

    function test_purchase_native_emits_event_and_forwards_to_treasury() public {
        AirtimePayments.Quote memory q = _quote();
        bytes memory sig = _sign(q, signerKey);
        uint256 before = treasury.balance;

        vm.expectEmit(true, true, true, true, address(payments));
        emit AirtimePayments.AirtimePurchased(
            q.quoteId, q.buyer, q.placementId, q.creativeHash, q.startAt, q.endAt, q.paymentToken, q.amount
        );

        vm.prank(buyer);
        payments.purchase{value: q.amount}(q, sig);

        assertEq(treasury.balance, before + q.amount, "treasury received payment");
        assertEq(address(payments).balance, 0, "contract holds nothing");
        assertTrue(payments.consumedQuotes(q.quoteId), "quote consumed");
        assertTrue(payments.usedNonces(buyer, q.nonce), "nonce used");
    }

    function test_simultaneous_same_placement_loser_keeps_payment() public {
        AirtimePayments.Quote memory first = _quote();
        first.startAt = uint64(block.timestamp);
        first.endAt = uint64(block.timestamp + 300);
        bytes memory firstSig = _sign(first, signerKey);

        AirtimePayments.Quote memory second = _quote();
        second.startAt = first.startAt;
        second.endAt = first.endAt;
        second.quoteId = keccak256("quote-2");
        second.buyer = stranger;
        second.nonce = 2;
        bytes memory secondSig = _sign(second, signerKey);

        uint256 treasuryBefore = treasury.balance;
        uint256 loserBefore = stranger.balance;

        vm.prank(buyer);
        payments.purchase{value: first.amount}(first, firstSig);

        vm.startPrank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                AirtimePayments.PlacementProtected.selector, first.placementId, first.endAt
            )
        );
        payments.purchase{value: second.amount}(second, secondSig);
        vm.stopPrank();

        assertEq(treasury.balance, treasuryBefore + first.amount, "only the winner reaches treasury");
        assertEq(stranger.balance, loserBefore, "losing payment remains in buyer wallet");
        assertFalse(payments.consumedQuotes(second.quoteId), "losing quote remains unconsumed");
        assertEq(payments.protectedUntil(first.placementId), first.endAt, "winner protects placement");
    }

    function test_same_placement_can_be_bought_after_protection_ends() public {
        AirtimePayments.Quote memory first = _quote();
        first.startAt = uint64(block.timestamp);
        first.endAt = uint64(block.timestamp + 60);
        bytes memory firstSig = _sign(first, signerKey);
        vm.prank(buyer);
        payments.purchase{value: first.amount}(first, firstSig);

        vm.warp(first.endAt);
        AirtimePayments.Quote memory takeover = _quote();
        takeover.quoteId = keccak256("takeover");
        takeover.buyer = stranger;
        takeover.startAt = uint64(block.timestamp);
        takeover.endAt = uint64(block.timestamp + 120);
        takeover.expiresAt = uint64(block.timestamp + 180);
        takeover.nonce = 3;
        bytes memory takeoverSig = _sign(takeover, signerKey);

        vm.prank(stranger);
        payments.purchase{value: takeover.amount}(takeover, takeoverSig);

        assertTrue(payments.consumedQuotes(takeover.quoteId), "later takeover succeeds");
        assertEq(payments.protectedUntil(first.placementId), takeover.endAt, "new guarantee is protected");
    }

    function test_purchase_erc20_pulls_tokens_to_treasury() public {
        vm.prank(owner);
        payments.setTokenSupported(address(token), true);

        AirtimePayments.Quote memory q = _quote();
        q.paymentToken = address(token);
        q.amount = 250e18;
        bytes memory sig = _sign(q, signerKey);

        token.mint(buyer, 1000e18);
        vm.prank(buyer);
        token.approve(address(payments), q.amount);

        vm.prank(buyer);
        payments.purchase(q, sig);

        assertEq(token.balanceOf(treasury), q.amount);
        assertEq(token.balanceOf(buyer), 1000e18 - q.amount);
    }

    function test_hashQuote_matches_manual_digest() public view {
        AirtimePayments.Quote memory q = _quote();
        bytes32 structHash = keccak256(
            abi.encode(
                payments.QUOTE_TYPEHASH(),
                q.quoteId,
                q.buyer,
                q.placementId,
                q.creativeHash,
                q.startAt,
                q.endAt,
                q.paymentToken,
                q.amount,
                q.expiresAt,
                q.nonce
            )
        );
        bytes32 expected = keccak256(abi.encodePacked("\x19\x01", payments.domainSeparator(), structHash));
        assertEq(payments.hashQuote(q), expected);
    }

    // -----------------------------------------------------------------
    // Replay / expiry / tampering
    // -----------------------------------------------------------------

    function test_revert_quote_replay() public {
        AirtimePayments.Quote memory q = _quote();
        bytes memory sig = _sign(q, signerKey);
        vm.prank(buyer);
        payments.purchase{value: q.amount}(q, sig);

        vm.expectRevert(abi.encodeWithSelector(AirtimePayments.QuoteAlreadyConsumed.selector, q.quoteId));
        vm.prank(buyer);
        payments.purchase{value: q.amount}(q, sig);
    }

    function test_revert_nonce_reuse_with_new_quote_id() public {
        AirtimePayments.Quote memory q = _quote();
        bytes memory sig = _sign(q, signerKey);
        vm.prank(buyer);
        payments.purchase{value: q.amount}(q, sig);

        AirtimePayments.Quote memory q2 = _quote();
        q2.quoteId = keccak256("quote-2");
        bytes memory sig2 = _sign(q2, signerKey);
        vm.expectRevert(abi.encodeWithSelector(AirtimePayments.NonceAlreadyUsed.selector, buyer, q2.nonce));
        vm.prank(buyer);
        payments.purchase{value: q2.amount}(q2, sig2);
    }

    function test_revert_expired_quote() public {
        AirtimePayments.Quote memory q = _quote();
        bytes memory sig = _sign(q, signerKey);
        vm.warp(q.expiresAt + 1);
        vm.expectRevert(
            abi.encodeWithSelector(AirtimePayments.QuoteExpired.selector, q.expiresAt, uint256(q.expiresAt) + 1)
        );
        vm.prank(buyer);
        payments.purchase{value: q.amount}(q, sig);
    }

    function test_revert_wrong_buyer() public {
        AirtimePayments.Quote memory q = _quote();
        bytes memory sig = _sign(q, signerKey);
        vm.expectRevert(abi.encodeWithSelector(AirtimePayments.WrongBuyer.selector, buyer, stranger));
        vm.prank(stranger);
        payments.purchase{value: q.amount}(q, sig);
    }

    function test_revert_wrong_amount() public {
        AirtimePayments.Quote memory q = _quote();
        bytes memory sig = _sign(q, signerKey);
        vm.expectRevert(
            abi.encodeWithSelector(AirtimePayments.WrongPaymentAmount.selector, q.amount, q.amount - 1)
        );
        vm.prank(buyer);
        payments.purchase{value: q.amount - 1}(q, sig);
    }

    function test_revert_tampered_creative_hash() public {
        AirtimePayments.Quote memory q = _quote();
        bytes memory sig = _sign(q, signerKey);
        q.creativeHash = keccak256("different-creative");
        vm.expectRevert(AirtimePayments.InvalidSignature.selector);
        vm.prank(buyer);
        payments.purchase{value: q.amount}(q, sig);
    }

    function test_revert_tampered_amount_in_struct() public {
        AirtimePayments.Quote memory q = _quote();
        bytes memory sig = _sign(q, signerKey);
        q.amount = 1 wei;
        vm.expectRevert(AirtimePayments.InvalidSignature.selector);
        vm.prank(buyer);
        payments.purchase{value: 1 wei}(q, sig);
    }

    function test_revert_signature_from_wrong_signer() public {
        AirtimePayments.Quote memory q = _quote();
        bytes memory sig = _sign(q, 0xDEAD);
        vm.expectRevert(AirtimePayments.InvalidSignature.selector);
        vm.prank(buyer);
        payments.purchase{value: q.amount}(q, sig);
    }

    function test_revert_malformed_signature() public {
        AirtimePayments.Quote memory q = _quote();
        vm.expectRevert(AirtimePayments.InvalidSignature.selector);
        vm.prank(buyer);
        payments.purchase{value: q.amount}(q, hex"1234");
    }

    function test_revert_wrong_chain_signature() public {
        AirtimePayments.Quote memory q = _quote();
        // Sign under chain 46630 (Robinhood testnet), then attempt to spend on a different chain.
        vm.chainId(46630);
        bytes memory sig = _sign(q, signerKey);
        vm.chainId(4663);
        vm.expectRevert(AirtimePayments.InvalidSignature.selector);
        vm.prank(buyer);
        payments.purchase{value: q.amount}(q, sig);
    }

    function test_revert_unsupported_token() public {
        AirtimePayments.Quote memory q = _quote();
        q.paymentToken = address(token);
        bytes memory sig = _sign(q, signerKey);
        vm.expectRevert(abi.encodeWithSelector(AirtimePayments.UnsupportedToken.selector, address(token)));
        vm.prank(buyer);
        payments.purchase(q, sig);
    }

    function test_revert_native_value_with_erc20_quote() public {
        vm.prank(owner);
        payments.setTokenSupported(address(token), true);
        AirtimePayments.Quote memory q = _quote();
        q.paymentToken = address(token);
        bytes memory sig = _sign(q, signerKey);
        vm.expectRevert(AirtimePayments.UnexpectedNativeValue.selector);
        vm.prank(buyer);
        payments.purchase{value: 1 wei}(q, sig);
    }

    function test_revert_zero_amount() public {
        AirtimePayments.Quote memory q = _quote();
        q.amount = 0;
        bytes memory sig = _sign(q, signerKey);
        vm.expectRevert(AirtimePayments.ZeroAmount.selector);
        vm.prank(buyer);
        payments.purchase(q, sig);
    }

    function test_revert_invalid_window() public {
        AirtimePayments.Quote memory q = _quote();
        q.endAt = q.startAt;
        bytes memory sig = _sign(q, signerKey);
        vm.expectRevert(AirtimePayments.InvalidWindow.selector);
        vm.prank(buyer);
        payments.purchase{value: q.amount}(q, sig);
    }

    function test_revert_when_paused() public {
        vm.prank(owner);
        payments.pause();
        AirtimePayments.Quote memory q = _quote();
        bytes memory sig = _sign(q, signerKey);
        vm.expectRevert();
        vm.prank(buyer);
        payments.purchase{value: q.amount}(q, sig);

        vm.prank(owner);
        payments.unpause();
        vm.prank(buyer);
        payments.purchase{value: q.amount}(q, sig);
    }

    function test_revert_treasury_rejects_funds() public {
        RejectingTreasury bad = new RejectingTreasury();
        vm.prank(owner);
        payments.setTreasury(address(bad));
        AirtimePayments.Quote memory q = _quote();
        bytes memory sig = _sign(q, signerKey);
        vm.expectRevert(AirtimePayments.TreasuryTransferFailed.selector);
        vm.prank(buyer);
        payments.purchase{value: q.amount}(q, sig);
    }

    // -----------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------

    function test_signer_rotation_invalidates_old_signatures() public {
        AirtimePayments.Quote memory q = _quote();
        bytes memory oldSig = _sign(q, signerKey);
        address newSigner = vm.addr(0xC0FFEE);
        vm.prank(owner);
        payments.setQuoteSigner(newSigner);

        vm.expectRevert(AirtimePayments.InvalidSignature.selector);
        vm.prank(buyer);
        payments.purchase{value: q.amount}(q, oldSig);

        bytes memory newSig = _sign(q, 0xC0FFEE);
        vm.prank(buyer);
        payments.purchase{value: q.amount}(q, newSig);
    }

    function test_only_owner_can_configure() public {
        vm.expectRevert();
        vm.prank(stranger);
        payments.setQuoteSigner(stranger);
        vm.expectRevert();
        vm.prank(stranger);
        payments.setTreasury(stranger);
        vm.expectRevert();
        vm.prank(stranger);
        payments.setTokenSupported(address(token), true);
        vm.expectRevert();
        vm.prank(stranger);
        payments.pause();
    }

    function test_ownership_is_two_step() public {
        vm.prank(owner);
        payments.transferOwnership(stranger);
        assertEq(payments.owner(), owner);
        vm.prank(stranger);
        payments.acceptOwnership();
        assertEq(payments.owner(), stranger);
    }

    function test_constructor_rejects_zero_addresses() public {
        vm.expectRevert(AirtimePayments.ZeroAddress.selector);
        new AirtimePayments(owner, address(0), treasury);
        vm.expectRevert(AirtimePayments.ZeroAddress.selector);
        new AirtimePayments(owner, signer, address(0));
    }

    // -----------------------------------------------------------------
    // Fuzz
    // -----------------------------------------------------------------

    function testFuzz_purchase_native(uint96 amount, uint64 startOffset, uint32 duration, uint256 nonce) public {
        amount = uint96(bound(amount, 1, 50 ether));
        duration = uint32(bound(duration, 1, 86400));
        startOffset = uint64(bound(startOffset, 0, 365 days));
        AirtimePayments.Quote memory q = _quote();
        q.amount = amount;
        q.startAt = uint64(block.timestamp) + startOffset;
        q.endAt = q.startAt + duration;
        q.nonce = nonce;
        bytes memory sig = _sign(q, signerKey);
        uint256 before = treasury.balance;
        vm.prank(buyer);
        payments.purchase{value: amount}(q, sig);
        assertEq(treasury.balance, before + amount);
    }
}
