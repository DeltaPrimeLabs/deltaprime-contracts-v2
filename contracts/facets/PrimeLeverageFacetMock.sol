// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;


import "./PrimeLeverageFacet.sol";

contract PrimeLeverageFacetMock is PrimeLeverageFacet {
    
    /**
     * @dev Internal pure function to check if address is whitelisted
     * @param addr The address to check
     * @return bool True if address is whitelisted, false otherwise
     */
    function _isWhitelisted(address addr) internal pure override returns (bool) {
        if (addr == 0x79CB45A2F32546D7DEdE875eFa4faC8FC3A5B850) return true;
        else if (addr == 0xC6ba6BB819f1Be84EFeB2E3f2697AD9818151e5D) return true;
        else if (addr == 0x1dA11c0d0A08151bFF3e9BdcCE24Ab1075558132) return true;
        else if (addr == 0xA6e26fb8a6155083EAc4ce6009933224a727DFFc) return true;
        else if (addr == 0x57c948bC1CA8DdF7B70021722E860c82814527D8) return true;
        else if (addr == 0xB3c1990C39E7b4CC4556CDd1B4F802A58f123DcE) return true;
        else if (addr == 0xec5A44cEe773D04D0EFF4092B86838d5Cd77eC4E) return true;
        else if (addr == 0xE0fE81A35cFC20c85Fc3013609b932AA708F7914) return true;
        else if (addr == 0xE1804DF460cBeb866e90424eDA5c50c41488Ffd0) return true;
        else if (addr == 0x7E2C435B8319213555598274FAc603c4020B94CB) return true;
        else if (addr == 0x082D54C0015da6cC95F60F6194c8103F4a68921D) return true;
        else if (addr == 0xc45E7444171308DC9E254Ab28182976FD219b199) return true;
        else if (addr == 0x09BFA70ebF2D9c0A68E5e172025C57eeb29F96c5) return true;
        else if (addr == 0x60deC93EDC9e9678267e695B8F894643bE968F2e) return true;
        else if (addr == 0xA4f936C97410d366ed389B90A064cEE0688004aE) return true;
        else if (addr == 0x0E5Bad4108a6A5a8b06820f98026a7f3A77466b2) return true;
        else if (addr == 0xEb6c79b5339854aD3FA032d05000B00B94cc2E95) return true;
        // hardhat local address
        else if (addr == 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266) return true;
        // local address
        else if (addr == 0x70997970C51812dc3A010C7d01b50e0d17dc79C8) return true;
        // local address
        else if (addr == 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC) return true;
        // local address
        else if (addr == 0x90F79bf6EB2c4f870365E785982E1f101E93b906) return true;
        // local address
        else if (addr == 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65) return true;

        else return false;
    }
}