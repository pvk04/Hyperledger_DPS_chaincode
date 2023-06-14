const { Contract, Context } = require("fabric-contract-api");
const { UserList } = require("./users");

class LicensesList {
  constructor(ctx) {
    this.ctx = ctx;
    this.KEY = "LICENSES";
  }

  async getLicenses() {
    const licensesData = await this.ctx.stub.getState(this.KEY);

    return JSON.parse(licensesData.toString());
  }

  async getLicense(number) {
    const licenses = await this.getLicenses();

    return licenses[number];
  }

  async setLicenses(licenses) {
    const licensesData = Buffer.from(JSON.stringify(licenses));
    await this.ctx.stub.putState(this.KEY, licensesData);

    return licenses;
  }

  async setLicense(number, license) {
    const licenses = await this.getLicenses();
    licenses[number] = license;

    return await this.setLicenses(licenses);
  }
}

class LicensesContext extends Context {
  constructor() {
    super();
    this.licensesList = new LicensesList(this);
    this.userList = new UserList(this);
  }
}

class License {
  constructor(number, validity, category, driverLogin) {
    this.number = number;
    this.validity = validity;
    this.category = category;
    this.driverLogin = driverLogin ? driverLogin : "";
  }
}

class LicensesContract extends Contract {
  createContext() {
    return new LicensesContext();
  }

  // функция для инициализации контракта
  static async init(ctx) {
    const licenses = {};
    licenses["000"] = new License("000", "11.01.2021", "A");
    licenses["111"] = new License("111", "12.05.2025", "B");
    licenses["222"] = new License("222", "09.09.2020", "C");
    licenses["333"] = new License("333", "13.02.2027", "A");
    licenses["444"] = new License("444", "10.09.2020", "B");
    licenses["555"] = new License("555", "24.06.2029", "C");
    licenses["666"] = new License("666", "31.03.2030", "A");

    return await ctx.licensesList.setLicenses(licenses);
  }

  //
  static async getLicenses() {
    return await ctx.licensesList.getLicenses();
  }

  // функция для добавления удостоверения водителю. принимает логин водителя, номер удостоверения, его срок действия и категория
  static async addDriverToLicense(ctx, login, number, validity, category) {
    const driver = await ctx.userList.getUser(login);
    const license = await ctx.licensesList.getLicense(number);

    if (!driver) {
      return { error: "Такого пользователя не существует" };
    }
    if (driver.licenseNumber != "") {
      return { error: "Пользователь уже имеет водительское удостоверение" };
    }
    if (!license) {
      return { error: "Удостоверения с таким номером нет в базе" };
    }
    if (license.driverLogin != "") {
      return { error: "Это удостоверение принадлежит другому водителю" };
    }
    if (
      license.number != number ||
      license.validity != validity ||
      license.category != category
    ) {
      return { error: "Введенные данные не совпадают" };
    }

    license.driverLogin = login;
    await ctx.licensesList.setLicense(number, license);
    driver.licenseNumber = number;
    return await ctx.userList.setUser(login, user);
  }
}

module.exports.LicensesContract = LicensesContract;
module.exports.LicensesList = LicensesList;
