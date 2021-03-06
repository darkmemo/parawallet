import {action, runInAction, computed, observable, reaction, toJS} from "mobx";
import SecoKeyval from "seco-keyval";
import * as C from "../constants";
import { Wallet, Balance, Transaction, TransactionStatus, WalletEventListener } from "./wallet";
import * as assert from "assert";
import { loggers, Logger } from "../util/logger";

class NopEventListener implements WalletEventListener {
    public onBalanceChange(address: string, previousAmount: number, currentAmount: number) {
        // nop
    }

    public onTransactionComplete(txid: string, amount: number, status: TransactionStatus) {
        // nop
    }
}

// tslint:disable-next-line:no-empty-interface
export interface AbstractWallet extends Wallet {
}

export abstract class AbstractWallet implements Wallet {
    protected readonly logger: Logger;
    public readonly code: string;
    public readonly name: string;

    protected readonly kv: SecoKeyval;

    protected listener: WalletEventListener = new NopEventListener();

    @observable
    protected balances: Balance[] = [];

    @observable
    protected transactions: Transaction[] = [];
    private pendingTransaction: string | null;
    @observable
    private defaultPublicAddress: string;

    constructor(code: string, name: string, kv: SecoKeyval) {
        this.code = code;
        this.name = name;
        this.kv = kv;
        this.logger = loggers.getLogger(name + "Wallet");

        this.checkPendingTransaction = this.checkPendingTransaction.bind(this);
    }

    @computed
    public get defaultAddress(): string {
        if (!this.defaultPublicAddress && this.currentBalances && this.currentBalances.length > 0) {
            this.defaultPublicAddress = this.currentBalances[0].address;
        }
        return this.defaultPublicAddress;
    }

    @action
    public setDefaultAddress(address: string): Promise<string> {
        this.defaultPublicAddress = address;
        return this.kv.set(this.code + C.DEFAULT_ADDRESS_SUFFIX, this.defaultPublicAddress);
    }

    @computed
    public get currentBalances(): ReadonlyArray<Balance> {
        return this.balances;
    }

    @computed
    public get totalBalanceAmount(): number {
        return this.balances.map((b) => b.amount)
            .reduce((prev, current) => prev + current, 0);
    }

    @computed
    public get knownTransactions(): ReadonlyArray<Transaction> {
        return this.transactions;
    }

    public isPublicAddress(address: string) {
        return true;
    }

    @action
    public async initialize(createEmpty: boolean) {
        await this.initializeImpl(createEmpty);
        this.balances = await this.kv.get(this.code + C.BALANCES_SUFFIX) || [];
        this.defaultPublicAddress = await this.kv.get(this.code + C.DEFAULT_ADDRESS_SUFFIX);
        if (!this.defaultPublicAddress && this.balances.length > 0) {
            await this.setDefaultAddress(this.balances[0].address);
        }

        this.transactions = await this.kv.get(this.code + C.TRANSACTIONS_SUFFIX) || [];
        this.trackPendingTransaction();

        reaction(() => this.totalBalanceAmount, () => this.onBalancesChange());
        reaction(() => this.transactions.map((tx) => tx.status), () => this.persistTransactions());

        // https://jsblog.insiderattack.net/timers-immediates-and-process-nexttick-nodejs-event-loop-part-2-2c53fd511bb3
        // https://jsblog.insiderattack.net/promises-next-ticks-and-immediates-nodejs-event-loop-part-3-9226cbe7a6aa
        setImmediate(this.updateBalances.bind(this));
    }

    protected abstract initializeImpl(createEmpty: boolean): Promise<any>;

    private trackPendingTransaction() {
        const pendingTx = this.transactions.find((tx) => tx.status === "pending");
        if (pendingTx) {
            this.pendingTransaction = pendingTx.id;
            setImmediate(this.checkPendingTransaction);
        }
    }

    private schedulePendingTransactionCheck() {
        setTimeout(this.checkPendingTransaction, 10000);
    }

    private async onBalancesChange() {
        const prevBalances: Balance[] = await this.kv.get(this.code + C.BALANCES_SUFFIX) || [];
        this.logger.debug(`${this.code}: Persisting balances: ${JSON.stringify(this.balances)}`);
        this.kv.set(this.code + C.BALANCES_SUFFIX, toJS(this.balances));

        const balanceMap = new Map(prevBalances.map((balance) => [balance.address, balance.amount] as [string, number]));
        this.balances.forEach((balance) => {
            const prevAmount = balanceMap.get(balance.address);
            if (!prevAmount || prevAmount !== balance.amount) {
                this.listener.onBalanceChange(balance.address, prevAmount || 0, balance.amount);
                // TODO: !!! updating transactions is not ready yet !!!
                // Balances changed, update transactions
                // this.updateTransactions(balance.address);
          }
        });
    }

    // @action
    // private async updateTransactions(address: string) {
    //   let txns = await this.getTransactions(address);
    //   // remove already known transactions
    //   txns = txns.filter((tx) => !this.knownTransactionIds.has(tx.id));
    //   if (txns.length > 0) {
    //     runInAction(() => txns.forEach((tx) => this.transactions.push(tx)));
    //   }
    // }
    //
    // protected abstract getTransactions(address: string): Promise<Transaction[]>;
    //
    // @computed
    // private get knownTransactionIds() {
    //   return new Set(this.transactions.map((tx) => tx.id));
    // }

    private persistTransactions() {
        this.logger.debug(`${this.code}: Persisting transactions: ${JSON.stringify(this.transactions)}`);
        this.kv.set(this.code + C.TRANSACTIONS_SUFFIX, toJS(this.transactions));
    }

    @action
    public async addNewAddress() {
        const address = await this.addNewAddressImpl();
        runInAction(() => this.balances.push({address, amount: 0}));
        return address;
    }

    protected abstract addNewAddressImpl(): Promise<string>;

    @action
    public updateBalances() {
        const p = this.updateBalancesImpl();
        p.then((balances) => {
            balances = balances || [];
            runInAction(() => this.balances = balances);
        });
        return p;
    }

    protected abstract updateBalancesImpl(): Promise<Balance[]>;

    public supportsMultiAddressTransactions(): boolean {
        return false;
    }

    public send(toAddress: string, amount: number, fromAddress?: string): Promise<string> {
        if (this.pendingTransaction) {
            return Promise.reject(`Cannot initiate a new transaction before transaction[${this.pendingTransaction}] finalizes.`);
        }
        if (this.supportsMultiAddressTransactions() && fromAddress) {
            return Promise.reject("This wallet doesn't support explicit 'fromAddress'");
        }
        if (!this.supportsMultiAddressTransactions() && !fromAddress) {
            return Promise.reject("This wallet requires explicit 'fromAddress'");
        }

        const p = this.sendImpl(toAddress, amount, fromAddress);
        p.then((txid) => {
            runInAction(() => this.transactions.push({
                amount,
                destination: toAddress,
                id: txid,
                source: fromAddress,
                status: "pending",
                timestamp: Date.now(),
            }));
            this.pendingTransaction = txid;
            this.schedulePendingTransactionCheck();
        });

        return p;
    }

    protected abstract sendImpl(toAddress: string, amount: number, fromAddress?: string): Promise<string>;

    private async checkPendingTransaction() {
        if (!this.pendingTransaction) {
            this.logger.debug(this.code + ": No pending transaction at the moment.");
            return;
        }

        this.logger.debug(`${this.code}: Checking pending transaction: ${this.pendingTransaction}`);
        const status = await this.transactionStatus(this.pendingTransaction);

        if (status === "pending") {
            this.schedulePendingTransactionCheck();
        } else {
            const tx = this.transactions[this.transactions.length - 1];
            assert.strictEqual(tx.id, this.pendingTransaction);

            tx.status = status;
            this.logger.info(`${this.code}: Completed transaction: ${JSON.stringify(tx)}`);

            this.pendingTransaction = null;
            this.updateBalances();
            this.listener.onTransactionComplete(tx.id, tx.amount, tx.status);
        }
    }

    protected abstract transactionStatus(txid: string): Promise<TransactionStatus>;

    public setEventListener(listener: WalletEventListener) {
        this.listener = listener || new NopEventListener();
    }
}
