import SecoKeyval from "seco-keyval";
import {AbstractWallet, Balance, Wallet, TransactionStatus, Transaction} from "../wallet";
import {EthWalletRpc} from "./wallet-rpc";
import * as C from "../../constants";
import { stringifyErrorReplacer } from "../../util/errors";

export enum EthNetworkType {
    mainnet, homestead, ropsten, testnet, rinkeby,
}

interface EthTransactionResponse {
    readonly blockHash: string;
    readonly hash: string;
    readonly to: string;
    readonly from: string;
    readonly value: number;
}

export class EthWallet extends AbstractWallet implements Wallet {
    private readonly rpc: EthWalletRpc;

    constructor(kv: SecoKeyval, mnemonic: string, mnemonicPass: string, network: EthNetworkType) {
        super("ETH", "Ethereum", kv);
        this.rpc = new EthWalletRpc(kv, mnemonic, mnemonicPass, network);
        console.info(`ETH using ${EthNetworkType[network]} network`);
    }

    protected initializeImpl(createEmpty: boolean) {
        return this.rpc.initialize(createEmpty);
    }

    protected addNewAddressImpl(): Promise<string> {
        return this.rpc.addNewAddress();
    }

    protected updateBalancesImpl(): Promise<Balance[]> {
        const balancePromises: Array<Promise<Balance>> = this.rpc.getWalletBalances();
        return Promise.all(balancePromises);
    }

    protected sendImpl(toAddress: string, amount: number, fromAddress?: string): Promise<string> {
        return this.rpc.send(fromAddress, toAddress, amount);
    }

    public getExporerURL() {
        return this.rpc.explorerURL;
    }

    protected async getTransactions(address: string): Promise<Transaction[]> {
        // Etherscan allows querying tx history: https://docs.ethers.io/ethers.js/html/api-providers.html#etherscan
        try {
            const txns: EthTransactionResponse[] = await this.rpc.getHistory();
            return txns.map((tx) => {
                console.log(`ETH TX: ${JSON.stringify(tx)}`);
                const status: TransactionStatus = "success";
                return {id: tx.hash, timestamp: 0, source: tx.from, destination: tx.to, amount: tx.value / 1.0e18, status};
            });
        } catch (error) {
            console.log(JSON.stringify(error, stringifyErrorReplacer));
        }
        return [];
    }

    protected async transactionStatus(txid: string): Promise<TransactionStatus> {
        try {
            // https://docs.ethers.io/ethers.js/html/api-providers.html#transactionresponse
            const tx: EthTransactionResponse = await this.rpc.getTransaction(txid);
            console.log(`ETH TX RECEIPT: ${JSON.stringify(tx)}`);
            if (tx && tx.blockHash) {
                return "success";
            }
            // TODO: failed transaction ???
        } catch (error) {
            console.log(JSON.stringify(error, stringifyErrorReplacer));
        }
        return "pending";
    }
}
