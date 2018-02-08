import {clipboard, shell} from "electron";
import * as React from "react";
import {IWallet} from "../core/wallet";
import {totpValidator, TotpVerifyDialog} from "./totp";


interface IContentPaneProps {
    readonly wallet: IWallet;
    readonly address: string;
    readonly balance: number;
}

export class WalletPane extends React.Component<IContentPaneProps, any> {
    constructor(props: IContentPaneProps) {
        super(props);
        this.copyAddress = this.copyAddress.bind(this);
    }

    public render() {
        const wallet = this.props.wallet;
        return (
            <div style={{padding: "20px"}}>
                <h1>
                    <i className={"icon cc " + wallet.code} title={wallet.code}/>
                    &nbsp; {wallet.name}
                </h1>
                <span className="coin_header">
          Balance: {this.props.balance} {wallet.code}
        </span>

                <hr/>
                <h5>Receive {wallet.name}:</h5> Your Address:
                <input type="text" className="form-control" readOnly={true} value={this.props.address}/>
                <input className="btn btn-default" type="button" value="Copy Address" onClick={this.copyAddress}/>
                <hr/>
                <TransferPane wallet={wallet}/>
            </div>
        );
    }

    private copyAddress() {
        clipboard.writeText(this.props.address);
    }
}

interface ITransferPaneProps {
    readonly wallet: IWallet;
}

class TransferState {
    public readonly address: string;
    public readonly amount: number | string;
    public readonly verifyToken: boolean;
    public readonly explorerUrl: string;
    public readonly txnId: string;

    constructor(address: string, amount: number | string, verifyToken?: boolean, explorerUrl?: string, txnId?: string) {
        this.address = address;
        this.amount = amount;
        this.verifyToken = verifyToken ? verifyToken : false;
        this.txnId = txnId ? txnId : "";
        this.explorerUrl = explorerUrl ? explorerUrl : "";
    }
}

class TransferPane extends React.Component<ITransferPaneProps, TransferState> {
    public constructor(props: ITransferPaneProps) {
        super(props);
        this.state = new TransferState("", 0);

        this.handleAmountChange = this.handleAmountChange.bind(this);
        this.handleAddressChange = this.handleAddressChange.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
        this.onVerifyToken = this.onVerifyToken.bind(this);
    }

    public render() {
        if (this.state.verifyToken) {
            return <TotpVerifyDialog show={true} onVerify={this.onVerifyToken}/>;
        }
        return (
            <div>
                <h5>Send {this.props.wallet.name}:</h5>

                <form onSubmit={this.handleSubmit}>
                    <div className="form-group">
                        <label>To Address:</label>
                        <input type="text" className="form-control" value={this.state.address}
                               onChange={this.handleAddressChange}/>
                    </div>
                    <div className="form-group">
                        <label>Amount:</label>
                        <input type="text" className="form-control" value={this.state.amount}
                               onChange={this.handleAmountChange}/>
                    </div>
                    <div className="form-actions">
                        <input className="btn btn-large btn-default" type="submit" value="Submit"/>
                    </div>
                </form>
                <a className="txn-result" href="#" onClick={(event) => this.handleTxnResult(event, this.state.explorerUrl, this.state.txnId )}>
                    {this.state.txnId ? "Transaction completed click for details." : ""}
                </a>
                <br/>
                {this.state.txnId ? "Transaction id: " + this.state.txnId : ""}

            </div>
        );
    }

    private handleTxnResult(event: any, explorerUrl: string, txnResult: string) {
        event.preventDefault();
        shell.openExternal(explorerUrl + txnResult);
    }

    private handleAmountChange(event: React.FormEvent<HTMLInputElement>) {
        const target = event.target as HTMLInputElement;
        this.setState((prevState, props) => {
            return new TransferState(prevState.address, target.value);
        });
        event.preventDefault();
    }

    private handleAddressChange(event: React.FormEvent<HTMLInputElement>) {
        const target = event.target as HTMLInputElement;
        this.setState((prevState, props) => {
            return new TransferState(target.value, prevState.amount);
        });
        event.preventDefault();
    }

    private handleSubmit(event: React.FormEvent<any>) {
        event.preventDefault();

        if (totpValidator.enabled) {
            this.setState((prevState, props) => {
                return new TransferState(prevState.address, prevState.amount, true);
            });
        } else {
            this.transfer();
        }
    }

    // TODO: update balance in main UI
    private transfer() {
        this.props.wallet.send(this.state.address, Number(this.state.amount), (explorerUrl: string, txnResult: string) => {
            this.setState((prevState, props) => {
                return new TransferState(prevState.address, prevState.amount, prevState.verifyToken, explorerUrl, txnResult);
            });
        });
    }

    private onVerifyToken(valid: boolean) {
        this.setState((prevState, props) => {
            return new TransferState(prevState.address, prevState.amount, false);
        });

        if (!valid) {
            return;
        }
        this.transfer();
    }
}
