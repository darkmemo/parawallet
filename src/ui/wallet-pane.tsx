import { computed, observable, reaction, action } from "mobx";
import { observer } from "mobx-react";
import {clipboard, shell} from "electron";
import * as React from "react";
import * as Modal from "react-modal";
import { toast } from "react-toastify";
import {Wallet} from "../core/wallet";
import {TransferPane} from "./transfer-pane";
import {PaneHeader} from "./pane-header";


interface WalletPaneProps {
    readonly wallet: Wallet;
}

@observer
export class WalletPane extends React.Component<WalletPaneProps, any> {
    @observable
    private showTransferPane: boolean = false;

    @observable
    private showEmptyAccounts: boolean = false;

    @observable
    private showTransactions: boolean = false;

    constructor(props: WalletPaneProps) {
        super(props);
        this.addNewAddress = this.addNewAddress.bind(this);
        this.copyAddress = this.copyAddress.bind(this);
        this.onTransactionSubmit = this.onTransactionSubmit.bind(this);
    }

    public render() {
        const wallet = this.props.wallet;
        return (
            <div>
                <PaneHeader title={wallet.name} icon={"icon cc " + wallet.code} subtitle={"Current Balance: " + wallet.totalBalanceAmount + wallet.code}/>

                <input className="btn btn-default" type="button" value="Add New Address" onClick={this.addNewAddress}/>
                <input className="btn btn-default" type="button" value="Refresh Balances" onClick={() => wallet.updateBalances()}/>
                <input className="btn btn-default" type="button" value={this.showTransactions ? "Show Balances" : "Show Transactions"}
                    onClick={() => this.showTransactions = !this.showTransactions}/>
                <input className="btn btn-default" type="button" value="Send Coin" onClick={() => this.showTransferPane = true}/>
                <hr/>

                {this.showTransactions ? this.renderTransactions(wallet) : this.renderWalletBalances(wallet)}

                <Modal isOpen={this.showTransferPane}
                    onRequestClose={() => this.showTransferPane = false} contentLabel="Transfer"
                    shouldCloseOnOverlayClick={false} shouldCloseOnEsc={false} ariaHideApp={false}>
                    <TransferPane wallet={wallet} onSubmit={this.onTransactionSubmit} onCancel={() => this.showTransferPane = false} />
                </Modal>

            </div>
        );
    }

    private renderWalletBalances(wallet: Wallet) {
        const rows = wallet.currentBalances.map((balance, index) => {
            const isPublicAddress = wallet.isPublicAddress(balance.address);
            if (balance.amount === 0 && !isPublicAddress && !this.showEmptyAccounts) {
                return null;
            }
            let copyBtn = null;
            if (isPublicAddress) {
                copyBtn = (<input className="btn" type="button" value="Copy" onClick={() => this.copyAddress(balance.address)}/>);
            }
            return (
                <tr key={index}>
                    <td>{copyBtn}</td>
                    <td>{balance.address}</td>
                    <td>{balance.amount}&nbsp;{wallet.code}</td>
                </tr>
            );
        });

        const checkBoxRow = wallet.supportsMultiAddress() ? (
            <tr>
                <th colSpan={3}>
                <input type="checkbox" checked={this.showEmptyAccounts} onClick={() => this.showEmptyAccounts = !this.showEmptyAccounts}/>
                <label>Show addresses with zero balance</label>
                </th>
            </tr>
            ) : null;

        return (
            <table className="form-group">
                <thead>
                    {checkBoxRow}
                    <tr>
                        <th>#</th>
                        <th>Address</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>{rows}</tbody>
            </table>
        );
    }

    private renderTransactions(wallet: Wallet) {
        const rows = wallet.knownTransactions.map((tx, index) => {
            return (
                <tr key={index}>
                    <td>{tx.status}</td>
                    <td><a className="txn-result" href="#" onClick={(event) => this.openTxnExplorer(event, tx.id)}>{tx.id}</a></td>
                    <td>{tx.amount}</td>
                    <td>{tx.destination}</td>
                </tr>
            );
        });

        return (
            <table className="form-group">
                <thead>
                    <tr>
                        <th>Status</th>
                        <th>TxID</th>
                        <th>Amount</th>
                        <th>Destination</th>
                    </tr>
                </thead>
                <tbody>{rows}</tbody>
            </table>
        );
    }

    @action
    private onTransactionSubmit() {
        this.showTransferPane = false;
        this.showTransactions = true;
    }

    private openTxnExplorer(event: any, txid: string) {
        event.preventDefault();
        const url = this.props.wallet.getExporerURL() + txid;
        console.log(`Opening ${url}`);
        shell.openExternal(url);
    }

    private async addNewAddress() {
        const wallet = this.props.wallet;
        const newAddress = await wallet.addNewAddress();
        toast.info(`Added new address ${newAddress}.`, {autoClose: 3000});
    }

    private copyAddress(address: string) {
        clipboard.writeText(address);
        toast.info(`Copied ${address} to clipboard.`, {autoClose: 1000});
    }
}
