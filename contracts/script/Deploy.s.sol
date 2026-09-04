// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AirtimePayments} from "../src/AirtimePayments.sol";

/// @notice Deploys AirtimePayments.
///
/// Required environment variables:
///   DEPLOYER_PRIVATE_KEY   - key that broadcasts and becomes the initial owner
///   QUOTE_SIGNER_ADDRESS   - address derived from AIRTIME_QUOTE_SIGNER_PRIVATE_KEY (backend)
///   TREASURY_ADDRESS       - where payments are forwarded
/// Optional:
///   OWNER_ADDRESS          - override owner (defaults to deployer)
contract Deploy is Script {
    function run() external returns (AirtimePayments payments) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address quoteSigner = vm.envAddress("QUOTE_SIGNER_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address owner = vm.envOr("OWNER_ADDRESS", vm.addr(deployerKey));

        vm.startBroadcast(deployerKey);
        payments = new AirtimePayments(owner, quoteSigner, treasury);
        vm.stopBroadcast();

        console.log("AirtimePayments deployed at", address(payments));
        console.log("  owner       ", owner);
        console.log("  quoteSigner ", quoteSigner);
        console.log("  treasury    ", treasury);
        console.log("  chainId     ", block.chainid);
    }
}
