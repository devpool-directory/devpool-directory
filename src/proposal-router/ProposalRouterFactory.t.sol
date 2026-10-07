// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../ProposalRouterFactory.sol";

contract ProposalRouterFactoryTest is Test {
    
    ProposalRouterFactory public factory;
    address public creator = address(0x1);
    
    function setUp() public {
        factory = new ProposalRouterFactory();
    }
    
    function testCreateRouter() public {
        vm.prank(creator);
        address router = factory.createRouter();
        
        assertTrue(factory.routers(router));
        assertEquals(factory.getRouterCount(), 1);
        assertEquals(factory.getRouterByIndex(0), router);
    }
    
    function testMultipleRouters() public {
        vm.prank(creator);
        factory.createRouter();
        factory.createRouter();
        factory.createRouter();
        
        assertEquals(factory.getRouterCount(), 3);
    }
}
