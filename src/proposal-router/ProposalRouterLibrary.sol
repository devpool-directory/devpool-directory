// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ProposalRouterLibrary
 * @dev Biblioteca de utilitários para o ProposalRouter
 */
library ProposalRouterLibrary {
    
    struct RouteParams {
        address target;
        bytes data;
        uint256 value;
        string description;
        uint256 deadline;
        uint256 minDelay;
    }
    
    /**
     * @dev Valida os parâmetros de roteamento
     */
    function validateRouteParams(RouteParams memory _params) 
        internal 
        pure 
        returns (bool) 
    {
        return _params.target != address(0) 
            && _params.deadline > block.timestamp
            && _params.minDelay >= 1 days;
    }
    
    /**
     * @dev Calcula o hash de uma proposta
     */
    function calculateProposalHash(
        address _target,
        bytes memory _data,
        uint256 _value,
        string memory _description,
        uint256 _nonce
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            _target,
            keccak256(_data),
            _value,
            keccak256(bytes(_description)),
            _nonce
        ));
    }
    
    /**
     * @dev Verifica se uma proposta está dentro do prazo
     */
    function isWithinDeadline(uint256 _createdAt, uint256 _deadline) internal pure returns (bool) {
        return block.timestamp <= _deadline;
    }
}
