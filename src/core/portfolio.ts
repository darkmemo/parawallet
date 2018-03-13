import SecoKeyval from "seco-keyval";
import {Wallet} from "./wallet";
import * as C from "../constants";
import {getPrice, cacheThePrices} from "./coinPrices";
import * as moment from "moment";
import {Moment} from "moment";


class PortfolioRecord {
    public readonly dateStr: string;
    public portfolio: string;
    public value: number = 0;

    constructor(dateStr: string) {
        this.dateStr = dateStr;
    }
}

export async function getPortfolioHistory(kv: SecoKeyval | undefined) {
    if (!kv) {
        throw new Error("KV is required");
    }
    if (!kv.hasOpened) {
        throw new Error("KV is not ready yet!");
    }
    const portfolioRecordList: PortfolioRecord[] = await kv.get(C.PORTFOLIO_HISTORY);
    if (!portfolioRecordList) {
        throw new Error("Portfolio record list is not initialized!");
    }
    return portfolioRecordList;
}


// todo the below parses all coins. we need to keep active wallets and do calculations just for them
export async function getAndUpdatePortfolioHistory(kv: SecoKeyval | undefined, wallets: Wallet[]) {
    console.log("getAndUpdatePortfolioHistory");
    if (!kv) {
        throw new Error("KV is required");
    }
    if (!kv.hasOpened) {
        throw new Error("KV is not ready yet!");
    }
    // todo delete below line
    // await kv.delete(C.PORTFOLIO_HISTORY);

    const portfolioRecordList: PortfolioRecord[] = await kv.get(C.PORTFOLIO_HISTORY);
    if (portfolioRecordList) {
        console.log("Portfolio records:");
        console.log(portfolioRecordList);
        const lastRecord: PortfolioRecord = portfolioRecordList[portfolioRecordList.length - 1];
        const todayStr: string = moment().format(C.DATE_FORMAT);
        console.log("lastRecord");
        console.log(lastRecord);
        console.log("lastRecord-date" + lastRecord.dateStr);
        console.log("today-str" + todayStr);
        if (lastRecord.dateStr !== todayStr) {
            for (const wallet of wallets) {
                await cacheThePrices(wallet.code, lastRecord.dateStr, todayStr);
            }
            let cursorDate: Moment = moment(lastRecord.dateStr);
            const todayDate: Moment = moment().startOf("day");
            const portfolioMap: Map<string, number> = new Map(JSON.parse(lastRecord.portfolio));
            while (cursorDate < todayDate) {
                cursorDate = moment(cursorDate).add(1, "days");
                const portfolioRecord: PortfolioRecord = new PortfolioRecord(cursorDate.format(C.DATE_FORMAT));
                portfolioRecord.portfolio = lastRecord.portfolio;
                let totalValue: number = 0;
                for (const coin of Array.from(portfolioMap.keys())) {
                    const price = await getPrice(moment(cursorDate).format(C.DATE_FORMAT), coin);
                    const amount = portfolioMap.get(coin);
                    if (amount) {
                        totalValue += price * amount;
                    }
                }
                portfolioRecord.value = totalValue;
                portfolioRecordList.push(portfolioRecord);
            }
            await kv.set(C.PORTFOLIO_HISTORY, portfolioRecordList);
            return portfolioRecordList;
        }
    } else {
        console.log("Creating portfolio records!");
        const promises: Array<Promise<any>> = [];
        const newPortfolioRecordList: PortfolioRecord[] = [];
        // const temp = moment().subtract(5, "days");
        // const dateStr: string = temp.format(C.DATE_FORMAT);
        const dateStr: string = moment().format(C.DATE_FORMAT);
        const portfolioRecord: PortfolioRecord = new PortfolioRecord(dateStr);
        let totalValue: number = 0;
        const currentPortfolioMap: Map<string, number> = new Map();
        for (const wallet of wallets) {
            const balance: number = await wallet.totalBalanceAmount();
            const price: number = await getPrice(dateStr, wallet.code);
            const value: number = balance * price;
            totalValue += value;
            currentPortfolioMap.set(wallet.code, balance);
        }
        portfolioRecord.value = totalValue;
        portfolioRecord.portfolio = JSON.stringify(Array.from(currentPortfolioMap.entries()));
        newPortfolioRecordList.push(portfolioRecord);
        console.log("newPortfolioRecordList");
        console.log(newPortfolioRecordList);
        await kv.set(C.PORTFOLIO_HISTORY, newPortfolioRecordList);
        return newPortfolioRecordList;
    }
}
