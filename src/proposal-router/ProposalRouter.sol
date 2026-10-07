// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title ProposalRouter
 * @dev Router para direcionar propostas aos contratos executores apropriados
 * dentro do ecossistema Ubiquity DAO
 */
contract ProposalRouter is Ownable, ReentrancyGuard {
    
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
    
    mapping(uint256 => Proposal) public proposals;
    mapping(address => bool) public authorizedHandlers;
    mapping(address => uint256) public handlerProposalCount;
    
    uint256 public proposalCount;
    uint256 public constant MIN_DELAY = 1 days;
    
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
    
    modifier onlyAuthorizedHandler() {
        require(authorizedHandlers[msg.sender], "Not authorized handler");
        _;
    }
    
    modifier validProposal(uint256 _proposalId) {
        require(_proposalId > 0 && _proposalId <= proposalCount, "Invalid proposal");
        _;
    }
    
    /**
     * @dev Autoriza um handler para executar propostas
     */
    function authorizeHandler(address _handler) external onlyOwner {
        require(_handler != address(0), "Invalid address");
        require(!authorizedHandlers[_handler], "Already authorized");
        
        authorizedHandlers[_handler] = true;
        emit HandlerAuthorized(_handler);
    }
    
    /**
     * @dev Revoga autorização de um handler
     */
    function revokeHandler(address _handler) external onlyOwner {
        require(authorizedHandlers[_handler], "Not authorized");
        
        authorizedHandlers[_handler] = false;
        emit HandlerRevoked(_handler);
    }
    
    /**
     * @dev Roteia uma nova proposta para o handler designado
     */
    function routeProposal(
        address _target,
        bytes calldata _data,
        uint256 _value,
        string calldata _description
    ) external returns (uint256) {
        require(_target != address(0), "Invalid target");
        require(authorizedHandlers[_target], "Target not authorized");
        
        proposalCount++;
        uint256 proposalId = proposalCount;
        
        proposals[proposalId] = Proposal({
            target: _target,
            data: _data,
            value: _value,
            status: ProposalStatus.Pending,
            createdAt: block.timestamp,
            executedAt: 0,
            proposer: msg.sender,
            description: _description
        });
        
        handlerProposalCount[_target]++;
        
        emit ProposalRouted(proposalId, _target, msg.sender, _value, _description);
        
        return proposalId;
    }
    
    /**
     * @dev Executa uma proposta roteada
     */
    function executeProposal(uint256 _proposalId) 
        external 
        onlyAuthorizedHandler() 
        validProposal(_proposalId)
        nonReentrant
    {
        Proposal storage proposal = proposals[_proposalId];
        
        require(proposal.status == ProposalStatus.Pending, "Already processed");
        require(block.timestamp >= proposal.createdAt + MIN_DELAY, "Delay not passed");
        
        proposal.status = ProposalStatus.Active;
        
        (bool success, ) = proposal.target.call{value: proposal.value}(proposal.data);
        
        if (success) {
            proposal.status = ProposalStatus.Executed;
            proposal.executedAt = block.timestamp;
            emit ProposalExecuted(_proposalId, msg.sender, block.timestamp);
        } else {
            proposal.status = ProposalStatus.Failed;
        }
    }
    
    /**
     * @dev Cancela uma proposta pendente
     */
    function cancelProposal(uint256 _proposalId) 
        external 
        validProposal(_proposalId)
    {
        Proposal storage proposal = proposals[_proposalId];
        
        require(msg.sender == proposal.proposer || msg.sender == owner(), "Not authorized");
        require(proposal.status == ProposalStatus.Pending, "Already processed");
        
        proposal.status = ProposalStatus.Cancelled;
    }
    
    /**
     * @dev Retorna informações de uma proposta
     */
    function getProposal(uint256 _proposalId) 
        external 
        view 
        validProposal(_proposalId)
        returns (Proposal memory)
    {
        return proposals[_proposalId];
    }
    
    /**
     * @dev Retorna o número total de propostas de um handler
     */
    function getHandlerProposalCount(address _handler) external view returns (uint256) {
        return handlerProposalCount[_handler];
    }
}
