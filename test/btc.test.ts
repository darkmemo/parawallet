import {assert, expect} from "chai";

import { BtcWallet } from "../src/core/btc-wallet";

describe("BTC Local", () => {
  it("Create Wallet", () => {
    const btc = new BtcWallet(null);
  });
});