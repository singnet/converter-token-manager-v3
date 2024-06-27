const { expect } = require("chai");
const { ethers } = require("hardhat");
const { formatBytes32String } = require("@ethersproject/strings");
const { arrayify, splitSignature } = require("@ethersproject/bytes");
var ethereumjsabi = require('ethereumjs-abi')
const Buffer = require('buffer').Buffer;


describe("TokenConversionManagerV3 - Lock mechanic", function () {
    let authorizer, tokenHolder
    let token, converter;

    const amount = 1000000000;

    beforeEach(async () => {
        [
          authorizer,
          tokenHolder
        ] = await ethers.getSigners();
        
        const Token = await ethers.getContractFactory("Token");
        token = await Token.deploy("SingularityNET Token", "AGIX");
        
        await token.mint(tokenHolder.address, 10000000000);  // 100 tokens      

        const TokenConversionСonverter = await ethers.getContractFactory("TokenConversionManagerV3");
        converter = await TokenConversionСonverter.deploy(
            await token.getAddress(), // address of token to convert
        );

        await converter.updateConfigurations(1000000000, 100000000000); //!! min 1 max 1000 maxs 10000
        await converter.updateAuthorizer(await authorizer.getAddress());
        await token.grantRole("0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6", converter.getAddress());
        
        await token.mint(await converter.getAddress(), 1000000000000000);  // 100k liquid
    });
  
    it("Should handle conversionOut correctly", async function () {

        const [ authorizer ] = await ethers.getSigners();
        const initialBalance = 1000000000000000;

        await token.connect(tokenHolder).approve(await converter.getAddress(), amount);
        await converter.updateAuthorizer(await authorizer.getAddress());

        const messageHash = ethereumjsabi.soliditySHA3(
            ["string", "uint256", "address", "bytes32", "address"],
            ["__conversionOut", amount, await tokenHolder.getAddress(),
            "0x" + Buffer.from("conversionId").toString('hex'),
            await converter.getAddress()]
        );
    
        const msg = arrayify(messageHash);
        const signature = await authorizer.signMessage(msg);

        const { v, r, s } = splitSignature(signature);
        
        await converter.connect(tokenHolder).conversionOut(
            amount,
            formatBytes32String("conversionId"),
            v, r, s
        );
        
        expect(BigInt(initialBalance+amount)).to.equal(BigInt(await token.balanceOf(await converter.getAddress())));
    });

    it("Should handle conversionIn correctly", async function () {

        const [ authorizer ] = await ethers.getSigners();
        const initBalanceBeforeConversionIn = await token.balanceOf(await converter.getAddress())

        await token.connect(tokenHolder).approve(await converter.getAddress(), amount);
        await converter.updateAuthorizer(await authorizer.getAddress())

        const messageHash = ethereumjsabi.soliditySHA3(
            ["string", "uint256", "address", "bytes32", "address"],
            ["__conversionIn", amount, await tokenHolder.getAddress(),
            "0x" + Buffer.from("conversionId").toString('hex'),
            await converter.getAddress()]
        );
    
        const msg = arrayify(messageHash);
        const signature = await authorizer.signMessage(msg);

        const { v, r, s } = splitSignature(signature);

        await converter.connect(tokenHolder).conversionIn(
            tokenHolder.getAddress(),
            amount,
            formatBytes32String("conversionId"),
            v, r, s
        )
        expect(BigInt(initBalanceBeforeConversionIn)-BigInt(amount)).to.equal(BigInt(await token.balanceOf(await converter.getAddress())));
    });

    it("Should be revert conversionOut correctly while token paused", async function () {

        const [ authorizer ] = await ethers.getSigners();

        await token.connect(tokenHolder).approve(await converter.getAddress(), amount);
        await converter.updateAuthorizer(await authorizer.getAddress());

        await token.pause();

        const messageHash = ethereumjsabi.soliditySHA3(
            ["string", "uint256", "address", "bytes32", "address"],
            ["__conversionOut", amount, await tokenHolder.getAddress(),
            "0x" + Buffer.from("conversionId").toString('hex'),
            await converter.getAddress()]
        );
    
        const msg = arrayify(messageHash);
        const signature = await authorizer.signMessage(msg);

        const { v, r, s } = splitSignature(signature);
        
        await expect(converter.connect(tokenHolder).conversionOut(
            amount,
            formatBytes32String("conversionId"),
            v, r, s
        )).to.be.revertedWith("Pausable: paused");
    });

    it("Should be revert conversionIn correctly while token paused", async function () {

        const [ authorizer ] = await ethers.getSigners();

        await token.connect(tokenHolder).approve(await converter.getAddress(), amount);
        await converter.updateAuthorizer(await authorizer.getAddress());

        await token.pause();

        const messageHash = ethereumjsabi.soliditySHA3(
            ["string", "uint256", "address", "bytes32", "address"],
            ["__conversionIn", amount, await tokenHolder.getAddress(),
            "0x" + Buffer.from("conversionId").toString('hex'),
            await converter.getAddress()]
        );
    
        const msg = arrayify(messageHash);
        const signature = await authorizer.signMessage(msg);

        const { v, r, s } = splitSignature(signature);

        await expect(converter.connect(tokenHolder).conversionIn(
            tokenHolder.getAddress(),
            amount,
            formatBytes32String("conversionId"),
            v, r, s
        )).to.be.revertedWith("Pausable: paused")
    });

    it("Should be correct return converter settings", async function () {
     
        let minimum = 1000000000;
        let maximum = 100000000000;

        let currectConverterSettings = await converter.getConversionConfigurations();

        expect(currectConverterSettings[0]).to.equal(BigInt(minimum));
        expect(currectConverterSettings[1]).to.equal(BigInt(maximum));

    });

    it("Should be correct returns converter balance", async function () {

        let balance = await converter.getConverterBalance();

        expect(BigInt(balance)).to.equal(BigInt(await converter.getConverterBalance()));
        
    });

    it("Should be correct returns converter authorizer", async function () {

        let conversionAuthorizer = await converter.getConversionAuthorizer();

        expect(conversionAuthorizer).to.equal(await authorizer.getAddress());
        
    });

    it("Should be correct increase liquidity", async function () {

        const [ admin, intruder ] = await ethers.getSigners();

        let amountLiquidity = 100000000000;

        await converter.transferOwnership(await admin.getAddress());

        await converter.connect(admin).acceptOwnership();

        await token.mint(await admin.getAddress(), amountLiquidity);

        await token.connect(admin).approve(await converter.getAddress(), amountLiquidity);

        let beforeIncreaseLiquidityConverterBalance = await token.balanceOf(await converter.getAddress());

        await converter.connect(admin).increaseConverterLiquidity(amountLiquidity);

        expect(BigInt(beforeIncreaseLiquidityConverterBalance)+BigInt(amountLiquidity))
        .to.equal(BigInt(await token.balanceOf(await converter.getAddress())));

        await expect(
        converter.connect(intruder).increaseConverterLiquidity(amountLiquidity)
        ).to.be.revertedWith("Ownable: caller is not the owner");

    });

    it("Should be correct decrease liquidity", async function () {

        const [ admin, intruder ] = await ethers.getSigners();

        let amountLiquidity = 100000000000;

        await converter.transferOwnership(await admin.getAddress());

        await converter.connect(admin).acceptOwnership();

        await token.mint(await admin.getAddress(), amountLiquidity);

        await token.connect(admin).approve(await converter.getAddress(), amountLiquidity);

        await converter.connect(admin).increaseConverterLiquidity(amountLiquidity);

        let beforeDecreaseConverterLiquidity = await token.balanceOf(await converter.getAddress());

        await expect(
        converter.connect(admin).decreaseConverterLiquidity(amountLiquidity+amountLiquidity)
        ).to.be.revertedWithCustomError(converter, "WithdrawExceedsDeposit")
        
        // correct decrease
        await converter.connect(admin).decreaseConverterLiquidity(amountLiquidity);

        await token.mint(await converter.getAddress(), 100000000000)
        
        await expect(
        converter.connect(admin).decreaseConverterLiquidity(100000000)
        ).to.be.revertedWithCustomError(converter, "InsufficientLiquidityBalance")

        expect(BigInt(beforeDecreaseConverterLiquidity)+BigInt(100000000000)-BigInt(amountLiquidity))
        .to.equal(BigInt(await token.balanceOf(await converter.getAddress())));

        await expect(
        converter.connect(intruder).decreaseConverterLiquidity(amountLiquidity)
        ).to.be.revertedWith("Ownable: caller is not the owner");
    });
});

describe("TokenConversionManagerV3 - Lock mechanic", function () {
    let authorizer, tokenHolder
    let token, converter;

    const amount = 1000000000;

    beforeEach(async () => {
        [
          authorizer,
          tokenHolder
        ] = await ethers.getSigners();
        
        const Token = await ethers.getContractFactory("Token");
        token = await Token.deploy("SingularityNET Token", "AGIX");
        
        await token.mint(tokenHolder.address, 10000000000);  // 100 tokens      

        const TokenConversionСonverter = await ethers.getContractFactory("TokenConversionManagerV3");
        converter = await TokenConversionСonverter.deploy(
            await token.getAddress(), // address of token to convert
        );

        await converter.updateConfigurations(1000000000, 100000000000); //!! min 1 max 1000 maxs 10000
        await converter.updateAuthorizer(await authorizer.getAddress());
    });

    it("Should be revert conversionIn correctly while contract balance insufficient", async function () {

        const [ authorizer ] = await ethers.getSigners();

        await token.connect(tokenHolder).approve(await converter.getAddress(), amount);
        await converter.updateAuthorizer(await authorizer.getAddress());

        const messageHash = ethereumjsabi.soliditySHA3(
            ["string", "uint256", "address", "bytes32", "address"],
            ["__conversionIn", amount, await tokenHolder.getAddress(),
            "0x" + Buffer.from("conversionId").toString('hex'),
            await converter.getAddress()]
        );
    
        const msg = arrayify(messageHash);
        const signature = await authorizer.signMessage(msg);

        const { v, r, s } = splitSignature(signature);

        await expect(converter.connect(tokenHolder).conversionIn(
            tokenHolder.getAddress(),
            amount,
            formatBytes32String("conversionId"),
            v, r, s
        )).to.be.revertedWithCustomError(converter, "InsufficientConverterBalance")
    });
});

describe("TokenConversionManagerV3 - Check unauthorized and invalid operations", function () {
    let authorizer, tokenHolder
    let token, converter;

    const amount = 1000000000;

    beforeEach(async () => {
        [
          authorizer,
          tokenHolder
        ] = await ethers.getSigners();
        
        const Token = await ethers.getContractFactory("Token");
        token = await Token.deploy("SingularityNET Token", "AGIX");
        
        await token.mint(tokenHolder.address, 10000000000);  // 100 tokens      

        const TokenConversionСonverter = await ethers.getContractFactory("TokenConversionManagerV3");
        converter = await TokenConversionСonverter.deploy(
            await token.getAddress(), // address of token to convert
        );

        await converter.updateConfigurations(1000000000, 100000000000); //!! min 1 max 1000 maxs 10000
        await converter.updateAuthorizer(await authorizer.getAddress());
        
        await token.mint(await converter.getAddress(), 1000000000000000);  // 100k liquid
    });
  
    it("Should handle conversionOut correctly revert unauthorized operation", async function () {
    
        const [ authorizer, intruder ] = await ethers.getSigners();

        await token.mint(intruder.address, 100000000000);  // 1k 

        await token.connect(intruder).approve(await converter.getAddress(), 1);
        await converter.updateAuthorizer(await authorizer.getAddress())
        
        let fakeAmount = 10000000000;
        const messageHash = ethereumjsabi.soliditySHA3(
            ["string", "uint256", "address", "bytes32", "address"],
            ["__conversionOut", fakeAmount, await intruder.getAddress(),
            "0x" + Buffer.from("Attack").toString('hex'),
            await converter.getAddress()]
        );
    
        const msg = arrayify(messageHash);
        const signature = await intruder.signMessage(msg);

        const { v, r, s } = splitSignature(signature);

        await expect(
        converter.connect(intruder).conversionOut(
            fakeAmount,
            formatBytes32String("Attack"),
            v, r, s
        )
        ).to.be.revertedWithCustomError(converter, "InvalidRequestOrSignature");
    }); 

    it("Should handle token conversionIn correctly revert unauthorized operation", async function () {

        const [ authorizer, intruder ] = await ethers.getSigners();

        await converter.updateAuthorizer(await authorizer.getAddress())

        let fakeAmount = 10000000000;

        const messageHash = ethereumjsabi.soliditySHA3(
            ["string", "uint256", "address", "bytes32", "address"],
            ["__conversionIn", fakeAmount, await intruder.getAddress(),
            "0x" + Buffer.from("Attack").toString('hex'),
            await converter.getAddress()]
        );
    
        const msg = arrayify(messageHash);
        const signature = await intruder.signMessage(msg);

        const { v, r, s } = splitSignature(signature);

        await expect(converter.connect(intruder).conversionIn(
            tokenHolder.getAddress(),
            fakeAmount,
            formatBytes32String("Attack"),
            v, r, s
        )).to.be.revertedWithCustomError(converter, "InvalidRequestOrSignature");
    });

    it("Should handle token conversionOut correctly revert violation of tx amount limits", async function () {
    
        const [ authorizer, user ] = await ethers.getSigners();

        await token.mint(user.getAddress(), 1000000000000000);  // 1k

        await token.connect(user).approve(await converter.getAddress(), 1000000000000000);
        await converter.updateAuthorizer(await authorizer.getAddress())
        
        let amount = 100000000;
        const messageHash = ethereumjsabi.soliditySHA3(
            ["string", "uint256", "address", "bytes32", "address"],
            ["__conversionOut", amount, await user.getAddress(),
            "0x" + Buffer.from("ConversioId").toString('hex'),
            await converter.getAddress()]
        );
    
        const msg = arrayify(messageHash);
        const signature = await authorizer.signMessage(msg);

        const { v, r, s } = splitSignature(signature);

        await expect(
            converter.connect(user).conversionOut(
                amount,
                formatBytes32String("ConversioId"),
                v, r, s
            )
        ).to.be.revertedWithCustomError(converter, "ViolationOfTxAmountLimits");
    });

    it("Should handle token conversionOut correctly revert operations with used signature", async function () {

        const [ authorizer, user ] = await ethers.getSigners();
        await token.mint(user.getAddress(), 1000000000);  // 1k
        let amount = 1000000000;

        await token.connect(tokenHolder).approve(await converter.getAddress(), amount);
        await converter.updateAuthorizer(await authorizer.getAddress())


        const messageHash = ethereumjsabi.soliditySHA3(
            ["string", "uint256", "address", "bytes32", "address"],
            ["__conversionOut", amount, await user.getAddress(),
            "0x" + Buffer.from("conversionId").toString('hex'),
            await converter.getAddress()]
        );
    
        const msg = arrayify(messageHash);
        const signature = await authorizer.signMessage(msg);

        const { v, r, s } = splitSignature(signature);
        
        await converter.connect(user).conversionOut(
            amount,
            formatBytes32String("conversionId"),
            v, r, s
        )

        await expect(converter.connect(user).conversionOut(
            amount,
            formatBytes32String("conversionId"),
            v, r, s
        )).to.be.revertedWithCustomError(converter, "UsedSignature");

        await token.connect(user).burn(
            1000000000
        )
    });

    it("Should handle token conversionIn correctly revert operations with used signature", async function () {

        const [ authorizer, user ] = await ethers.getSigners();
        await token.mint(user.getAddress(), 100000000);  // 1k
        let amount = 1000000000;

        await token.connect(user).approve(await converter.getAddress(), amount);
        await converter.updateAuthorizer(await authorizer.getAddress())

        const messageHash = ethereumjsabi.soliditySHA3(
            ["string", "uint256", "address", "bytes32", "address"],
            ["__conversionIn", amount, await tokenHolder.getAddress(),
            "0x" + Buffer.from("conversionId").toString('hex'),
            await converter.getAddress()]
        );
    
        const msg = arrayify(messageHash);
        const signature = await authorizer.signMessage(msg);

        const { v, r, s } = splitSignature(signature);

        await converter.connect(tokenHolder).conversionIn(
            user.getAddress(),
            amount,
            formatBytes32String("conversionId"),
            v, r, s
        );

        await expect(converter.connect(user).conversionIn(
            user.getAddress(),
            amount,
            formatBytes32String("conversionId"),
            v, r, s
        )).to.be.revertedWithCustomError(converter, "UsedSignature");
    }); 
});

describe("TokenConversionManagerV3 - Administrative functionality", function () {
    let authorizer, tokenHolder, newAuthorizer
    let token, converter;

    beforeEach(async () => {
        [
          authorizer,
          tokenHolder,
          newAuthorizer,
          intruder
        ] = await ethers.getSigners();
        
        const Token = await ethers.getContractFactory("Token");
        token = await Token.deploy("SingularityNET Token", "AGIX");
        
        await token.mint(tokenHolder.address, 10000000000);  // 100 tokens      

        const TokenConversionСonverter = await ethers.getContractFactory("TokenConversionManagerV3");
        converter = await TokenConversionСonverter.deploy(
            await token.getAddress(), // address of token to convert
        );

        await converter.updateConfigurations(1000000000, 100000000000); //!! min 1 max 1000 maxs 10000
        await converter.updateAuthorizer(await authorizer.getAddress());
        
        await token.mint(await converter.getAddress(), 1000000000000000);  // 100k liquid
    });
  
    it("Administrative Operation - Update Conversion Authorizer", async function () {

        [ admin ] = await ethers.getSigners();

        await converter.updateAuthorizer(await newAuthorizer.getAddress());

        let updatedAuthorizer = await converter.getConversionAuthorizer();

        expect(updatedAuthorizer).to.equal(await newAuthorizer.getAddress());

        await converter.transferOwnership(await admin.getAddress());

        await converter.connect(admin).acceptOwnership();

        const zeroAddress = "0x0000000000000000000000000000000000000000";

        await expect(
        converter.connect(admin).updateAuthorizer(zeroAddress)
        ).to.be.revertedWithCustomError(converter, "ZeroAddress");

        await expect(
        converter.connect(intruder).updateAuthorizer(await intruder.getAddress())
        ).to.be.revertedWith("Ownable: caller is not the owner");        
    });

    it("Administrative Operation - Update Conversion Configuration", async function () {

        let [ newOwnerContract ] = await ethers.getSigners();

        let minimum = 100;
        let maximum = 500;
        await converter.updateConfigurations(minimum, maximum);
        let updatedConfigurations = await converter.getConversionConfigurations();

        expect(updatedConfigurations[0]).to.equal(BigInt(minimum));
        expect(updatedConfigurations[1]).to.equal(BigInt(maximum));

        await converter.transferOwnership(await newOwnerContract.getAddress());
        await converter.connect(newOwnerContract).acceptOwnership();

        let badMinimum = 0;
        let badMaximum = 100;

        await expect(
        converter.connect(newOwnerContract).updateConfigurations(badMinimum, badMaximum)
        ).to.be.revertedWithCustomError(converter, "InvalidUpdateConfigurations");

        await expect(
        converter.connect(intruder).updateConfigurations(
            minimum, maximum
        )
        ).to.be.revertedWith("Ownable: caller is not the owner");
    });
});