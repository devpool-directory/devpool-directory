// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IProposalRouterFactory
 * @dev Interface para a ProposalRouterFactory
 */
interface IProposalRouterFactory {
    
    event RouterCreated(address indexed router, address indexed creator);
    
    function createRouter() external returns (address);
    
    function routers(address) external view returns (bool);
    
    function getRouterCount() external view returns (uint256);
    
    function getRouterByIndex(uint256 _index) external view returns (address);
}
