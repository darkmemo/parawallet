import SecoKeyval from "seco-keyval";
import {AbstractWallet, Balance, Wallet} from "../wallet";
import {EthWalletRpc} from "./wallet-rpc";
import * as C from "../../constants";

export enum EthNetworkType {
    mainnet, homestead, ropsten, testnet, rinkeby,
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

    public sendFrom(from: string, toAddress: string, amount: number): Promise<string> {
        return this.rpc.send(from, toAddress, amount);
    }

    public getExporerURL() {
        return this.rpc.explorerURL;
    }
}
