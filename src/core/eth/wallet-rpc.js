import {ChainType, CoinType, generatePath} from "../bip44-path";
import { EthNetworkType } from "./eth-wallet";

var ethers = require("ethers");
var Wallet = ethers.Wallet;
var utils = ethers.utils;

// todo support multiple addresses
export class EthWalletRpc {
    constructor(mnemonic, pass, networkType) {
        this.coinType = CoinType.ETH;
        this.pass = pass || "";
        if (!mnemonic) {
            throw new Error("no mnemonic");
        }
        this.mnemonic = mnemonic;
        this.networkName = EthNetworkType[networkType];
    }

    initialize() {
        const promise = new Promise((resolve, reject) => {
            const providers = ethers.providers;
            // tslint:disable-next-line:no-string-literal
            const network = providers.networks[this.networkName];
            this.provider = new providers.EtherscanProvider(network);

            const path = generatePath(this.coinType, ChainType.EXTERNAL, 0);
            const HDNode = ethers.HDNode;
            const hdnode = HDNode.fromSeed(HDNode.mnemonicToSeed(this.mnemonic, this.pass)).derivePath(path);

            this.wallet = new Wallet(hdnode.privateKey, this.provider);
            resolve("success");
        });
        return promise;
    }

    getBalance() {
        return this.provider.getBalance(this.receiveAddress);
    }

    send(toAddr, etherAmount) {
        // todo check if we need to do something related to big numbers
        var options = {
            gasLimit: 30000,
            gasPrice: utils.bigNumberify("20000000000"),
        };
        var amount = etherAmount * 1e18;
        var sendPromise = this.wallet.send(toAddr, amount, options);
        return sendPromise.then((transactionResult) => {
            console.log("txn hash: " + JSON.stringify(transactionResult));
            return transactionResult.hash;
        });
        // todo return the receipt, tx hash etc
    }

    get receiveAddress() {
        return this.wallet ? this.wallet.address : "";
    }

    get explorerURL() {
        return this.provider ? this.provider.baseUrl + "/tx/" : "";
    }

}