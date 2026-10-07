// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IProposalRouter
 * @dev Interface para o ProposalRouter
 */
interface IProposalRouter {
    
    enum ProposalStatus { Pending, Active, Executed, Failed, Cancelled }
    
    struct Proposal {
        address target;
        bytes data;
        uint256 value;
        ProposalStatus status;
        uint256 createdAt;
        uint256 executedAt;
        address proposer;
        string description;
    }
    
    event ProposalRouted(
        uint256 indexed proposalId,
        address indexed target,
        address indexed proposer,
        uint256 value,
        string description
    );
    
    event ProposalExecuted(
        uint256 indexed proposalId,
        address indexed handler,
        uint256 executedAt
    );
    
    event HandlerAuthorized(address indexed handler);
    event HandlerRevoked(address indexed handler);
    
    function routeProposal(
        address _target,
        bytes calldata _data,
        uint256 _value,
        string calldata _description
    ) external returns (uint256);
    
    function executeProposal(uint256 _proposalId) external;
    
    function cancelProposal(uint256 _proposalId) external;
    
    function getProposal(uint256 _proposalId) external view returns (Proposal memory);
    
    function authorizeHandler(address _handler) external;
    
    function revokeHandler(address _handler) external;
    
    function proposalCount() external view returns (uint256);
    
    function authorizedHandlers(address) external view returns (bool);
}
