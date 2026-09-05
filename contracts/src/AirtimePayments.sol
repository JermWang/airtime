// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title AirtimePayments
/// @notice Deliberately small payment gateway for AIRTIME.
///
/// The contract has exactly one job: accept payment for a quote that the AIRTIME
/// backend has signed (EIP-712), make sure that quote can only be paid once, and emit a
/// canonical event the backend can verify independently. Scheduling, media and business
/// logic stay off-chain on purpose.
///
/// Chain binding: the EIP-712 domain separator includes `block.chainid` and this
/// contract address, so a quote signed for one chain/deployment can never be replayed
/// on another.
contract AirtimePayments is EIP712, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev Native ETH is represented by the zero address.
    address public constant NATIVE_TOKEN = address(0);

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(bytes32 quoteId,address buyer,bytes32 placementId,bytes32 creativeHash,uint64 startAt,uint64 endAt,address paymentToken,uint256 amount,uint64 expiresAt,uint256 nonce)"
    );

    struct Quote {
        bytes32 quoteId;
        address buyer;
        bytes32 placementId;
        bytes32 creativeHash;
        uint64 startAt;
        uint64 endAt;
        address paymentToken;
        uint256 amount;
        uint64 expiresAt;
        uint256 nonce;
    }

    address public quoteSigner;
    address public treasury;

    mapping(bytes32 quoteId => bool consumed) public consumedQuotes;
    mapping(address buyer => mapping(uint256 nonce => bool used)) public usedNonces;
    mapping(address token => bool supported) public supportedTokens;
    /// @notice End of the guaranteed window for the transaction that most
    /// recently won a placement. A second transaction for the same placement
    /// reverts while this timestamp is in the future, so its payment never
    /// leaves the losing buyer's wallet.
    mapping(bytes32 placementId => uint64 until) public protectedUntil;

    event AirtimePurchased(
        bytes32 indexed quoteId,
        address indexed buyer,
        bytes32 indexed placementId,
        bytes32 creativeHash,
        uint64 startAt,
        uint64 endAt,
        address paymentToken,
        uint256 amount
    );
    event QuoteSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event TokenSupportUpdated(address indexed token, bool supported);

    error InvalidSignature();
    error WrongBuyer(address expected, address actual);
    error QuoteExpired(uint64 expiresAt, uint256 nowTs);
    error QuoteAlreadyConsumed(bytes32 quoteId);
    error NonceAlreadyUsed(address buyer, uint256 nonce);
    error UnsupportedToken(address token);
    error WrongPaymentAmount(uint256 expected, uint256 actual);
    error UnexpectedNativeValue();
    error ZeroAmount();
    error ZeroAddress();
    error InvalidWindow();
    error PlacementProtected(bytes32 placementId, uint64 protectedUntil);
    error TreasuryTransferFailed();

    constructor(address initialOwner, address initialQuoteSigner, address initialTreasury)
        EIP712("AirtimePayments", "1")
        Ownable(initialOwner)
    {
        if (initialQuoteSigner == address(0) || initialTreasury == address(0)) revert ZeroAddress();
        quoteSigner = initialQuoteSigner;
        treasury = initialTreasury;
        supportedTokens[NATIVE_TOKEN] = true;
        emit QuoteSignerUpdated(address(0), initialQuoteSigner);
        emit TreasuryUpdated(address(0), initialTreasury);
        emit TokenSupportUpdated(NATIVE_TOKEN, true);
    }

    // ---------------------------------------------------------------------
    // Purchase
    // ---------------------------------------------------------------------

    /// @notice Pay for a backend-signed quote.
    /// @param quote The quote exactly as signed by the AIRTIME quote signer.
    /// @param signature EIP-712 signature over `quote` produced by `quoteSigner`.
    function purchase(Quote calldata quote, bytes calldata signature)
        external
        payable
        nonReentrant
        whenNotPaused
    {
        if (quote.buyer != msg.sender) revert WrongBuyer(quote.buyer, msg.sender);
        if (block.timestamp > quote.expiresAt) revert QuoteExpired(quote.expiresAt, block.timestamp);
        if (consumedQuotes[quote.quoteId]) revert QuoteAlreadyConsumed(quote.quoteId);
        if (usedNonces[quote.buyer][quote.nonce]) revert NonceAlreadyUsed(quote.buyer, quote.nonce);
        if (!supportedTokens[quote.paymentToken]) revert UnsupportedToken(quote.paymentToken);
        if (quote.amount == 0) revert ZeroAmount();
        if (quote.endAt <= quote.startAt || quote.endAt <= block.timestamp) revert InvalidWindow();

        bytes32 digest = hashQuote(quote);
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || recovered != quoteSigner) revert InvalidSignature();

        // Transactions are totally ordered by the chain even when buyers click
        // at the same instant. The first valid payment protects the placement
        // for its signed guaranteed window; a competing payment reverts before
        // any ETH or tokens move, which is an atomic refund to the loser.
        uint64 currentProtection = protectedUntil[quote.placementId];
        if (block.timestamp < currentProtection) {
            revert PlacementProtected(quote.placementId, currentProtection);
        }

        consumedQuotes[quote.quoteId] = true;
        usedNonces[quote.buyer][quote.nonce] = true;
        protectedUntil[quote.placementId] = quote.endAt;

        if (quote.paymentToken == NATIVE_TOKEN) {
            if (msg.value != quote.amount) revert WrongPaymentAmount(quote.amount, msg.value);
            (bool ok,) = treasury.call{value: msg.value}("");
            if (!ok) revert TreasuryTransferFailed();
        } else {
            if (msg.value != 0) revert UnexpectedNativeValue();
            IERC20(quote.paymentToken).safeTransferFrom(msg.sender, treasury, quote.amount);
        }

        emit AirtimePurchased(
            quote.quoteId,
            quote.buyer,
            quote.placementId,
            quote.creativeHash,
            quote.startAt,
            quote.endAt,
            quote.paymentToken,
            quote.amount
        );
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice EIP-712 digest for a quote under this contract's domain.
    function hashQuote(Quote calldata quote) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    QUOTE_TYPEHASH,
                    quote.quoteId,
                    quote.buyer,
                    quote.placementId,
                    quote.creativeHash,
                    quote.startAt,
                    quote.endAt,
                    quote.paymentToken,
                    quote.amount,
                    quote.expiresAt,
                    quote.nonce
                )
            )
        );
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setQuoteSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        emit QuoteSignerUpdated(quoteSigner, newSigner);
        quoteSigner = newSigner;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    function setTokenSupported(address token, bool supported) external onlyOwner {
        supportedTokens[token] = supported;
        emit TokenSupportUpdated(token, supported);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
