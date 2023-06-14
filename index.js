const { UserContract } = require("./users");
const { LicensesContract } = require("./licenses");

module.exports.UserContract = UserContract;
module.exports.LicensesContract = LicensesContract;

module.exports.contracts = [UserContract, LicensesContract];
