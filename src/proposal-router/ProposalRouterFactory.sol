// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ProposalRouter.sol";

/**
 * @title ProposalRouterFactory
 * @dev Factory para criação de instâncias do ProposalRouter
 */
contract ProposalRouterFactory {
    
    event RouterCreated(address indexed router, address indexed creator);
    
    mapping(address => bool) public routers;
    address[] public routerAddresses;
    
    /**
     * @dev Cria uma nova instância do ProposalRouter
     */
    function createRouter() external returns (address) {
        ProposalRouter router = new ProposalRouter();
        address routerAddress = address(router);
        
        routers[routerAddress] = true;
        routerAddresses.push(routerAddress);
        
        emit RouterCreated(routerAddress, msg.sender);
        
        return routerAddress;
    }
    
    /**
     * @dev Retorna o número total de routers criados
     */
    function getRouterCount() external view returns (uint256) {
        return routerAddresses.length;
    }
    
    /**
     * @dev Retorna o endereço do router pelo índice
     */
    function getRouterByIndex(uint256 _index) external view returns (address) {
        require(_index < routerAddresses.length, "Index out of bounds");
        return routerAddresses[_index];
    }
}
