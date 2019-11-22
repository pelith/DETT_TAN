pragma solidity ^0.5.0;

contract Ownable {
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    /**
     * @dev The Ownable constructor sets the original `owner` of the contract to the sender
     * account.
     */
    constructor() public {
        owner = msg.sender;
    }
    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }
    /**
     * @dev Allows the current owner to transfer control of the contract to a newOwner.
     * @param newOwner The address to transfer ownership to.
     */
    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0));
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}

contract Admin is Ownable {
	mapping(bytes32 => bool) public banned;
	mapping(address => bool) public isAdmin;

	address public category;

	event Ban(bytes32 indexed origin, bool banned, address admin, string reason);

	constructor(address _category) public {
		category = _category;
	}

	function ban(bytes32 origin, bool _banned, string memory reason) public {
		require(isAdmin[msg.sender]);
		banned[origin] = _banned;
		emit Ban(origin, _banned, msg.sender, reason);
	}

	function setAdmin(address who, bool _isAdmin) public onlyOwner {
		isAdmin[who] = _isAdmin;
	}
}
