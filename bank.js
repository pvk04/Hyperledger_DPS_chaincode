const { Contract, Context } = require("fabric-contract-api");

class BankList {
  constructor(ctx) {
    this.ctx = ctx;
    this.KEY - "BANK";
  }

  async setBank(bank) {
    const bankData = Buffer.from(JSON.stringify({ balance: 1000 } || bank));
    await this.ctx.stub.putState(this.KEY, bankData);
  }

  async increaseBalance(value) {
    const bankData = await this.ctx.stub.getState(this.KEY);
    const bank = JSON.parse(bankData.toString());
    bank.balance += value;

    return await this.setBank(bank);
  }
}

module.exports.BankList = BankList;
