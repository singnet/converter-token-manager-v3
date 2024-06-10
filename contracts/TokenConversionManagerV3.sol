// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

// Errors
error ViolationOfTxAmountLimits();
error InvalidRequestOrSignature();
error UsedSignature();
error ConversionFailed();
error InvalidUpdateConfigurations();
error InsufficientConverterBalance();
error InsufficientLiquidityBalance();
error IncreaseLiquidityFailed();
error DecreaseLiquidityFailed();
error WithdrawExceedsDeposit();
error ZeroAddress();

contract TokenConversionManagerV3 is Ownable2Step, ReentrancyGuard {

    address internal immutable TOKEN;

    address private _conversionAuthorizer; // Authorizer Address for the conversion

    /**
     * @dev Selector for the `transfer(address,uint256)` function
     * calculated as bytes4(keccak256("transfer(address,uint256)"))
     */
    bytes4 internal constant TRANSFER_SELECTOR = 0xa9059cbb;

    /**
     * @dev Selector for the `transferFrom(address,address,uint256)` function
     * calculated as bytes4(keccak256("transferFrom(address,address,uint256)"))
     */
    bytes4 private constant TRANSFERFROM_SELECTOR = 0x23b872dd;

    // already used conversion signature from authorizer in order to prevent replay attack
    mapping (bytes32 => bool) private _usedSignatures; 

    // Conversion Configurations
    uint256 private _perTxnMinAmount;
    uint256 private _perTxnMaxAmount;
    uint256 private _maxSupply;

    uint256 private _converterInternalLiquidity;

    // Events
    event NewAuthorizer(address conversionAuthorizer);
    event UpdateConfiguration(uint256 perTxnMinAmount, uint256 perTxnMaxAmount, uint256 maxSupply);

    event ConversionOut(address indexed tokenHolder, bytes32 conversionId, uint256 amount);
    event ConversionIn(address indexed tokenHolder, bytes32 conversionId, uint256 amount);

    event IncreaseLiquidity(uint256 added, uint256 totalLiquidity);
    event DecreaseLiquidity(uint256 removed, uint256 totalLiquidity);


    // Modifiers
    modifier checkLimits(uint256 amount) {
        // Check for min, max per transaction limits
        if (amount < _perTxnMinAmount || amount > _perTxnMaxAmount)
            revert ViolationOfTxAmountLimits();
        _;
    }

    modifier notZeroAddress(address account) {
        if (account == address(0))
            revert ZeroAddress();
        _;
    }

    constructor(address token) {   
        TOKEN = token;
        _conversionAuthorizer = _msgSender(); 
    }

    /**
    * @dev To update the authorizer who can authorize the conversions.
    * @param newAuthorizer - new contract authorizer address
    */
    function updateAuthorizer(address newAuthorizer) external notZeroAddress(newAuthorizer) onlyOwner {
        _conversionAuthorizer = newAuthorizer;

        emit NewAuthorizer(newAuthorizer);
    }

    /**
    * @dev To update the per transaction limits for the conversion and to provide max total supply 
    * @param perTxnMinAmount - min amount for conversion
    * @param perTxnMaxAmount - max amount for conversion
    * @param maxSupply - value of max supply for bridging token
    */
    function updateConfigurations(
        uint256 perTxnMinAmount, 
        uint256 perTxnMaxAmount, 
        uint256 maxSupply
    )
        external 
        onlyOwner 
    {
        // Check for the valid inputs
        if (perTxnMinAmount == 0 || perTxnMaxAmount <= perTxnMinAmount || maxSupply == 0) 
            revert InvalidUpdateConfigurations();

        // Update the configurations
        _perTxnMinAmount = perTxnMinAmount;
        _perTxnMaxAmount = perTxnMaxAmount;
        _maxSupply = maxSupply;

        emit UpdateConfiguration(perTxnMinAmount, perTxnMaxAmount, maxSupply);
    }


    /**
    * @dev To convert the tokens from Ethereum to non Ethereum network. 
    * The tokens which needs to be convereted will be burned on the host network.
    * The conversion authorizer needs to provide the signature to call this function.
    * @param amount - conversion amount
    * @param conversionId - hashed conversion id
    * @param v - split authorizer signature
    * @param r - split authorizer signature
    * @param s - split authorizer signature
    */
    function conversionOut(
        uint256 amount, 
        bytes32 conversionId, 
        uint8 v, 
        bytes32 r, 
        bytes32 s
    ) 
        external 
        payable
        checkLimits(amount) 
        nonReentrant 
    {
        // Check for non zero value for the amount is not needed as the Signature will not be generated for zero amount
        
        // Compose the message which was signed
        bytes32 message = prefixed(
            keccak256(
                abi.encodePacked(
                    "__conversionOut", 
                    amount,
                    _msgSender(),
                    conversionId, 
                    this
                )
            )
        );

        // Check that the signature is from the authorizer
        if (ecrecover(message, v, r, s) != _conversionAuthorizer)
            revert InvalidRequestOrSignature();

        // Check for replay attack (message signature can be used only once)
        if (_usedSignatures[message])
            revert UsedSignature();
        _usedSignatures[message] = true;

        (bool success, ) = TOKEN.call(
            abi.encodeWithSelector(
                TRANSFERFROM_SELECTOR, 
                _msgSender(),
                address(this),
                amount
            )
        );
                    
        // In case if the burn call fails
        if (!success)
            revert ConversionFailed();

        emit ConversionOut(_msgSender(), conversionId, amount);
    }

    /**
    * @dev To convert the tokens from non Ethereum to Ethereum network. 
    * The tokens which needs to be convereted will be minted on the host network.
    * The conversion authorizer needs to provide the signature to call this function.
    * @param to - distination conversion operation address for mint converted tokens
    * @param amount - conversion amount
    * @param conversionId - hashed conversion id
    * @param v - split authorizer signature
    * @param r - split authorizer signature
    * @param s - split authorizer signature
    */
    function conversionIn(
        address to, 
        uint256 amount, 
        bytes32 conversionId, 
        uint8 v, 
        bytes32 r, 
        bytes32 s
    )
        external
        payable
        checkLimits(amount) 
        nonReentrant 
        notZeroAddress(to)
    {
        // Check for non zero value for the amount is not needed as the Signature will not be generated for zero amount

        // Compose the message which was signed
        bytes32 message = prefixed(
            keccak256(
                abi.encodePacked(
                    "__conversionIn",
                    amount, 
                    _msgSender(), 
                    conversionId, 
                    this
                )
            )
        );

        // Check that the signature is from the authorizer
        if (ecrecover(message, v, r, s) != _conversionAuthorizer)
            revert InvalidRequestOrSignature();

        // Check for replay attack (message signature can be used only once)
        if (_usedSignatures[message])
            revert UsedSignature();
        _usedSignatures[message] = true;

        // check for available token on contract
        if (getConverterBalance() < amount)
            revert InsufficientConverterBalance();

        (bool success, ) = TOKEN.call(abi.encodeWithSelector(TRANSFER_SELECTOR, to, amount));

        if (!success)
            revert ConversionFailed();

        emit ConversionIn(to, conversionId, amount);
    }

    function increaseConverterLiquidity(uint amount) external onlyOwner {
        _converterInternalLiquidity += amount;

        (bool success, ) = TOKEN.call(
            abi.encodeWithSelector(
                TRANSFERFROM_SELECTOR, 
                _msgSender(),
                address(this),
                amount
            )
        );

        if (!success)
            revert IncreaseLiquidityFailed();
        
        emit IncreaseLiquidity(amount, _converterInternalLiquidity);
    }

    function decreaseConverterLiquidity(uint amount) external onlyOwner {
        if (_converterInternalLiquidity == 0)
            revert InsufficientLiquidityBalance();
        if (amount > _converterInternalLiquidity)
            revert WithdrawExceedsDeposit();

        _converterInternalLiquidity -= amount;

        (bool success, ) = TOKEN.call(abi.encodeWithSelector(TRANSFER_SELECTOR, _msgSender(), amount));

        if (!success)
            revert DecreaseLiquidityFailed();
        
        emit DecreaseLiquidity(amount, _converterInternalLiquidity);
    }

    /// Builds a prefixed hash to mimic the behavior of ethSign.
    function prefixed(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }

    function getConversionAuthorizer() external view returns (address) {
        return _conversionAuthorizer;
    }

    function getConversionConfigurations() external view returns (uint256,uint256,uint256) {
        return(_perTxnMinAmount, _perTxnMaxAmount, _maxSupply);
    }

    function getConverterBalance() public view returns (uint256) {
        return IERC20(TOKEN).balanceOf(address(this));
    }
}
