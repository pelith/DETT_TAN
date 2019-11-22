pragma solidity ^0.5.0;

contract BBS {
    mapping(bytes32 => uint256) public upvotes;
    mapping(bytes32 => uint256) public downvotes;
    mapping(address => mapping(bytes32 => bool)) public voted;

    event Posted(address author, string content);
    event Edited(address author, bytes32 origin, string content);
    event Replied(address author, bytes32 origin, uint256 vote, string content);

    function upvote(bytes32 post) internal {
        require(!voted[msg.sender][post]);
        voted[msg.sender][post] = true;
        upvotes[post] += 1;
    }

    function downvote(bytes32 post) internal {
        require(!voted[msg.sender][post]);
        voted[msg.sender][post] = true;
        downvotes[post] += 1;
    }

    function post(string memory content) public {
        emit Posted(msg.sender, content);
    }

    function edit(bytes32 origin, string memory content) public {
        emit Edited(msg.sender, origin, content);
    }

    function reply(bytes32 origin, uint256 vote, string memory content) public {
        if (vote == 1)
            upvote(origin);
        else if (vote == 2)
            downvote(origin);
        else
            vote = 0;
        emit Replied(msg.sender, origin, vote, content);
    }
}
