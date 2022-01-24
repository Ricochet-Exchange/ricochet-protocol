// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

import {ISuperToken} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "hardhat/console.sol";

library REXUniswapV2Adapter {
    /**
     * @dev Swap exact input SuperTokens for `minOutput` output (upgrade optional)
     * @param self This IUniswapV2Router02 instance
     * @param input ISuperToken input
     * @param output ISuperToken output
     * @param amount Input amount
     * @param minOutput Minimum amount of output tokens
     * @param deadline Deadline for the swap
     * @param upgradeAfterSwap Whether to upgrade the ouput back to SuperToken
     */
    function swap(
        IUniswapV2Router02 self,
        ISuperToken input,
        ISuperToken output,
        uint256 amount,
        uint256 minOutput,
        uint256 deadline,
        bool upgradeAfterSwap       // Use overload below to upgrade by default
    ) internal returns (uint256) {
        address inputToken;         // The underlying input token address
        address outputToken;        // The underlying output token address
        address[] memory path;      // The path to take
        uint256 outputAmount;       // The balance before the swap

        console.log("Input amount:", amount);

        inputToken = input.getUnderlyingToken();
        outputToken = output.getUnderlyingToken();

        // Downgrade and scale the input amount
        input.downgrade(amount);

        // Assumes a direct path to swap input/output
        path = new address[](2);
        path[0] = inputToken;
        path[1] = outputToken;
        self.swapExactTokensForTokens(
            amount,
            0, // Accept any amount but fail if we're too far from the oracle price
            path,
            amount,
            deadline
        );
        // Assumes `amount` was outputToken.balanceOf(address(this))
        outputAmount = ERC20(outputToken).balanceOf(amount);
        require(
            outputAmount >= minOutput,
            "BAD_EXCHANGE_RATE: Try again later"
        );

        // Convert the outputToken back to its supertoken version - if we were asked to do it
        if (upgradeAfterSwap) {
            output.upgrade(
                outputAmount * (10 ** (18 - ERC20(outputToken).decimals()))
            );
        }

        return outputAmount;
    }

    /**
     * @dev Overload to swap exact input SuperTokens for `minOutput` output SuperTokens
     */
    function swap(
        IUniswapV2Router02 self,
        ISuperToken input,
        ISuperToken output,
        uint256 amount,
        uint256 minOutput,
        uint256 deadline
    ) internal returns (uint256) {
        return swap(self, input, output, amount, minOutput, deadline, true);
    }
}
