import {observable} from "mobx";
import {observer} from "mobx-react";
import * as React from "react";
import * as ReactDOM from "react-dom";
import {ToastContainer, toast} from "react-toastify";
import * as C from "../constants";
import * as DB from "../util/secure-db";
import {WalletInit, WalletInitType} from "./wallet-init";
import {Page} from "./page";
import { TotpSetup, totpValidator } from "./totp";
import { getOrInitializeMnemonic, Wallet, newXrpWallet, newEthWallet, newBtcWallet } from "./wallets";
import {PortfolioStore} from "../core/portfolio";
import { WalletNotificationHandler } from "./wallet-notifications";
import {LoginCredentials} from "../core/login-credentials";
import {loggers} from "../util/logger";

enum PageId {
    AUTH,
    SETUP_2FA,
    LOADING,
    MAIN_PAGE,
}

@observer
class Main extends React.Component<any, any> {
    private readonly logger = loggers.getLogger("Main");
    private wallets: Wallet[] = [];
    private credentials: LoginCredentials;
    private loginType: WalletInitType;
    private mnemonic: string;
    private portfolioStore: PortfolioStore;
    @observable
    private activePage = PageId.AUTH;

    constructor(props: any) {
        super(props);
        this.onValidToken = this.onValidToken.bind(this);
    }

    public render() {
        return [this.renderActivePage(),
            (<ToastContainer position={toast.POSITION.TOP_CENTER} style={{width: "640px"}} autoClose={false} hideProgressBar={true} key="toast"/>)];
    }

    private renderActivePage() {
        switch (this.activePage) {
            case PageId.AUTH:
                return (
                    <WalletInit onLogin={(login: LoginCredentials, loginType: WalletInitType) => this.onLogin(login, loginType)}
                                key="login"/>);
            case PageId.SETUP_2FA:
                return (<TotpSetup onValidToken={this.onValidToken} key="totp"/>);
            case PageId.LOADING:
                return (
                    <div className="login-div w-100 h-100" key="loading">
                        <div className="text-center w-50" style={{margin: "auto"}}>
                            Loading...
                        </div>
                    </div>
                );
            case PageId.MAIN_PAGE:
                return this.renderPage();
        }
    }

    private onValidToken() {
        this.activePage = PageId.LOADING;
        this.initializeWallets(this.credentials.mnemonicPass, this.loginType === WalletInitType.NEW);
    }

    private async onLogin(loginCreds: LoginCredentials, loginType: WalletInitType) {
        this.activePage = PageId.LOADING;
        this.credentials = loginCreds;
        this.loginType = loginType;
        try {
            const walletKv = await DB.open(C.WALLET_DB, loginCreds.appPass);
            const configKv = await DB.open(C.CONFIG_DB, loginCreds.appPass);

            totpValidator.restore(configKv!);
            if (loginType === WalletInitType.NEW || loginType === WalletInitType.IMPORT) {
                // Clear local storage, if this is a newly created or imported wallet.
                localStorage.clear();
                this.activePage = PageId.SETUP_2FA;
            } else {
                this.activePage = PageId.LOADING;
                this.initializeWallets(loginCreds.mnemonicPass, false);
            }
        } catch (error) {
            this.activePage = PageId.AUTH;
            this.logger.error(error);
            toast.error("Wrong password!", {position: toast.POSITION.TOP_CENTER});
        }
    }

    private async initializeWallets(mnemonicPass: string, createEmpty: boolean) {
        const kv = DB.get(C.WALLET_DB)!;
        this.mnemonic = await getOrInitializeMnemonic(kv);

        const BTC = newBtcWallet(kv, this.mnemonic, mnemonicPass);
        const ETH = newEthWallet(kv, this.mnemonic, mnemonicPass);
        const XRP = newXrpWallet(kv, this.mnemonic, mnemonicPass);
        this.wallets.push(BTC, ETH, XRP);

        this.wallets.forEach((wallet) => wallet.setEventListener(new WalletNotificationHandler(wallet)));

        const promises = this.wallets.map((w) => w.initialize(createEmpty));
        await Promise.all(promises);

        this.activePage = PageId.LOADING;
        this.initializePortfolio();
    }

    private async initializePortfolio() {
        this.portfolioStore = new PortfolioStore(this.wallets);
        await this.portfolioStore.initializeOrUpdatePortfolioHistory();
        this.activePage = PageId.MAIN_PAGE;
    }

    private renderPage() {
        if (this.loginType === WalletInitType.NEW) {
            toast.warn("Please see backup page and write down backup phrase to a safe place!");
        } else if (this.loginType === WalletInitType.IMPORT) {
            // tslint:disable-next-line
            new Notification("Para Wallet", {
                body: "Wallet import completed successfully.",
            });
        }

        const defaultWallet = this.wallets[0];
        return (<Page defaultWalletCode={defaultWallet.code} wallets={this.wallets} portfolioStore={this.portfolioStore} mnemonics={this.mnemonic} key="page"/>);
    }
}

ReactDOM.render(<Main/>, document.getElementById("root"));
