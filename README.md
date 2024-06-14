# converter-token-manager-v3
Converter Token Manager V3: Lock tokens mechanic

Recommended using WSLv2/Linux/MacOS with LTS Node >= 18 & NPM >= 10 version

**Table of Contents**

- [Installation](#installation)
- [Commands to launch tests](#commands-to-launch-tests)
- [Use Case](#use-case)
- [Roles](#roles)
- [Functionality](#functionality)
  - [Converter Contract functionality requirements](#converter-contract-functionality-requirements)
- [Technical requirements](#technical-requirements)
  - [Project components](#project-components)
  - [`Token Conversion Manager` Contract](#token-conversion-manager-contract)
    - [Key-functions](#token-conversion-manager-key-functions)
    - [State variables](#token-conversion-manager-state-variables)

## Installation

1. Install dependencies
```bash
    npm install
```

## Compilation

1. Install dependencies
```bash
    npx hardhat compile
```

## Commands to launch tests
The `Token.sol` file with a sample token contract is only needed to run the tests (Not for audit).

3. Run Tests
```bash
    npx hardhat test
```

## Test coverage
The `Token.sol` file with a sample token contract is only needed to run the tests(Not for audit).

4. Run Tests
```bash
    npx hardhat coverage
```

# Use case

A contract is needed to convert tokens as part of the bridge between blockchains.

The contract will receive data about the transfer between different blockchains, including the signature that is generated on the backend, thereby verifying the transaction.

A detailed description of the contract's capabilities and mechanics of its use can be found in the [document](https://docs.google.com/document/d/1hqu1A_gutqfNgTRqdomhVs_HQ-3SDpsfrqdNjK3aBrs/edit?usp=sharing).

# Roles

1. Converter Contract Admin (Owner of contract) - can setup contract
2. User - can use conversion tokens functions
3. Converter Authorizer - account using for internal validation each conversion via signature in the contract

# Functionality

## Converter Contract functionality requirements

As part of the functionality, the contract should be able to transfer and lock of the users tokens for later issuance on another blockchain.

The converter contract should also be able to issue a validated number of tokens when using a specific role in the token.

The contract validates the minimum and maximum number of tokens within each conversion transaction. And also prevent exceeding the maximum number (max supply) of issued tokens for the token being used.

# Technical requirements

##  Project components

###  `Token Conversion Manager` Contract

The `TokenConversionManager` contract manages token conversions between Ethereum and non-Ethereum networks with signature verification. Signature is received from backend service and is used in order to prevent replay attacks. Key functionalities include updating authorizer address (backend service address actually) and configurations, and executing conversions in and out.

#### `Token Conversion Manager` Key-functions
- **constructor**
  - **Description**: Initializes the contract with token address, and sets the conversion authorizer to the deployer.

- **conversionOut**
  - **Parameters**: `uint256 amount, bytes32 conversionId, uint8 v, bytes32 r, bytes32 s`
  - **Description**: Converts tokens from Ethereum to non Ethereum network. The tokens which needs to be convereted will transfer to convtract for lock on the Ethereum network. The conversion authorizer needs to provide the signature to call this function.

- **conversionIn**
  - **Parameters**: `address to, uint256 amount, bytes32 conversionId, uint8 v, bytes32 r, bytes32 s`
  - **Description**: Converts tokens in (transferring them) after verifying the signature and preventing replay attacks.

- **updateAuthorizer**
  - **Parameters**: `address newAuthorizer`
  - **Description**: Updates the conversion authorizer address. Only callable by the contract owner.

- **updateConfigurations**
  - **Parameters**: `uint256 perTxnMinAmount, uint256 perTxnMaxAmount, uint256 maxSupply`
  - **Description**: Updates the conversion configuration limits. Only callable by the contract owner.

- **getconversionAuthorizer**
  - **Returns**: `address`
  - **Description**: Returns the current conversion authorizer address.

- **getConversionConfigurations**
  - **Returns**: `(uint256, uint256, uint256)`
  - **Description**: Returns the current conversion configuration limits.

</br>

#### `Token Conversion Manager` State variables

- **_conversionAuthorizer**
  - **Type**: `address`
  - **Description**: Stores the address of the entity authorized to approve conversions.

- **_usedSignatures**
  - **Type**: `mapping (bytes32 => bool)`
  - **Description**: Tracks used conversion signatures to prevent replay attacks.

- **_perTxnMinAmount, _perTxnMaxAmount, _maxSupply**
  - **Type**: `uint256`
  - **Description**: Configurations for minimum and maximum transaction amounts and maximum total supply.

</br> </br>
