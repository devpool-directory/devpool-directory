// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../ProposalRouter.sol";

contract ProposalRouterTest is Test {
    
    ProposalRouter public router;
    address public owner = address(0x1);
    address public handler = address(0x2);
    address public proposer = address(0x3);
    address public unauthorized = address(0x4);
    
    function setUp() public {
        vm.prank(owner);
        router = new ProposalRouter();
        
        vm.prank(owner);
        router.authorizeHandler(handler);
    }
    
    function testAuthorizeHandler() public {
        assertTrue(router.authorizedHandlers(handler));
        
        vm.prank(owner);
        router.revokeHandler(handler);
        
        assertFalse(router.authorizedHandlers(handler));
    }
    
    function testRouteProposal() public {
        bytes memory data = abi.encodeWithSignature("test()");
        
        vm.prank(proposer);
        uint256 proposalId = router.routeProposal(handler, data, 0 ether, "Test proposal");
        
        assertEquals(proposalId, 1);
        
        ProposalRouter.Proposal memory proposal = router.getProposal(proposalId);
        assertEquals(proposal.target, handler);
        assertEquals(proposal.proposer, proposer);
        assertEquals(proposal.status, ProposalRouter.ProposalStatus.Pending);
    }
    
    function testExecuteProposal() public {
        bytes memory data = abi.encodeWithSignature("test()");
        
        vm.prank(proposer);
        uint256 proposalId = router.routeProposal(handler, data, 0 ether, "Test proposal");
        
        vm.warp(block.timestamp + 2 days);
        
        vm.prank(handler);
        router.executeProposal(proposalId);
        
        ProposalRouter.Proposal memory proposal = router.getProposal(proposalId);
        assertEquals(proposal.status, ProposalRouter.ProposalStatus.Executed);
    }
    
    function testCancelProposal() public {
        bytes memory data = abi.encodeWithSignature("test()");
        
        vm.prank(proposer);
        uint256 proposalId = router.routeProposal(handler, data, 0 ether, "Test proposal");
        
        vm.prank(proposer);
        router.cancelProposal(proposalId);
        
        ProposalRouter.Proposal memory proposal = router.getProposal(proposalId);
        assertEquals(proposal.status, ProposalRouter.ProposalStatus.Cancelled);
    }
    
    function testOnlyAuthorizedHandlerCanExecute() public {
        bytes memory data = abi.encodeWithSignature("test()");
        
        vm.prank(proposer);
        uint256 proposalId = router.routeProposal(handler, data, 0 ether, "Test proposal");
        
        vm.warp(block.timestamp + 2 days);
        
        vm.expectRevert("Not authorized handler");
        vm.prank(unauthorized);
        router.executeProposal(proposalId);
    }
    
    function testMinDelay() public {
        bytes memory data = abi.encodeWithSignature("test()");
        
        vm.prank(proposer);
        uint256 proposalId = router.routeProposal(handler, data, 0 ether, "Test proposal");
        
        vm.expectRevert("Delay not passed");
        vm.prank(handler);
        router.executeProposal(proposalId);
    }
}
