const { Contract, Context } = require("fabric-contract-api");
const { LicensesList } = require("./licenses");
const { BankList } = require("./bank");

class UserList {
  constructor(ctx) {
    this.ctx = ctx;
    this.KEY = "USERS";
  }

  async getUsers() {
    const userData = await this.ctx.stub.getState(this.KEY);

    return JSON.parse(userData.toString());
  }

  async getUser(login) {
    const users = await this.getUsers();

    return users[login];
  }

  async setUsers(users) {
    const userData = Buffer.from(JSON.stringify(users));
    await this.ctx.stub.putState(this.KEY, userData);

    return users;
  }

  async setUser(login, user) {
    const users = await this.getUsers();
    users[login] = user;

    return await this.setUsers(users);
  }
}

class UserContext extends Context {
  constructor() {
    super();
    this.userList = new UserList(this);
    this.licensesList = new LicensesList(this);
    this.bankList = new BankList(this);
  }
}

class User {
  constructor({
    fio,
    isDPS,
    yearBegin,
    unpaidPenaltys,
    balance,
    licenseNumber,
  }) {
    this.fio = fio;
    this.isDPS = isDPS;
    this.yearBegin = yearBegin;
    this.unpaidPenaltys = unpaidPenaltys;
    this.balance = balance ? balance : 0;
    this.penaltys = [];
    this.cars = [];
    this.licenseNumber = licenseNumber ? licenseNumber : "";
  }
}

class Penalty {
  constructor(date) {
    this.date = date;
    this.status = false;
  }
}

class Car {
  constructor(category, price, term) {
    this.category = category;
    this.price = price;
    this.term = term;
  }
}

class UserContract extends Contract {
  createContext() {
    return new UserContext();
  }

  // функция для инициализаци контракта
  async init(ctx) {
    const users = {};
    users["Водитель 1"] = new User({
      fio: "Иванов Иван Иванович",
      isDPS: true,
      yearBegin: 2021,
      unpaidPenaltys: 0,
      balance: 50,
    });
    users["Водитель 2"] = new User({
      fio: "Семенов Семен Семенович",
      isDPS: false,
      yearBegin: 2018,
      unpaidPenaltys: 0,
      balance: 50,
    });
    users["Водитель 3"] = new User({
      fio: "Петров Петр Петрович",
      isDPS: false,
      yearBegin: 2013,
      unpaidPenaltys: 0,
      balance: 50,
    });

    return await ctx.userList.setUsers(users);
  }

  async getUsers(ctx) {
    return await ctx.userList.getUsers();
  }

  async getUser(ctx, login) {
    return await ctx.userList.getUser(login);
  }

  // функция для регистрации нового пользователя. принимает контекст, логин, фио, будет ли пользователь сотрудником ДПС, год стажа, неоплаченные штрафы и баланс
  async newUser(ctx, login, fio, isDPS, years, unpaidPenaltys, balance) {
    const isExists = await ctx.userList.getUser(login);

    if (isExists) {
      return { error: "Пользователь с таким логином уже существует" };
    }

    const user = new User({
      fio,
      isDPS,
      yearBegin: 2023 - years,
      unpaidPenaltys,
      balance,
    });

    if (unpaidPenaltys > 0) {
      for (let i = 0; i < unpaidPenaltys; i++) {
        user.penaltys.push(new Penalty(new Date()));
      }
    }

    return await ctx.userList.setUser(login, user);
  }

  // функция для создания штрафа. принимает контекст, логин вызвавшего, номер удостоверения того, кому выписывается штраф и текущая дата с сервера
  async makePenalty(ctx, login, license, date) {
    const user = await ctx.licensesList.getLicense(license);
    const loginTo = user.driverLogin;
    const worker = await ctx.userList.getUser(login);
    const penaltyUser = await ctx.userList.getUser(loginTo);

    if (!worker || !penaltyUser) {
      return {
        error: `Не существует пользователя с логином: ${
          !worker ? login : loginTo
        }`,
      };
    }

    if (!worker.isDPS) {
      return { error: "Вы не являетесь сотрудником ДПС" };
    }

    penaltyUser.penaltys.push(new Penalty(date));
    penaltyUser.unpaidPenaltys++;

    return await ctx.userList.setUser(loginTo, penaltyUser);
  }

  // функция для оплаты штрафа. принимает контекст, логин вызвавшего, индекс штрафа и текущую дату с сервера
  async payPenalty(ctx, login, penaltyId, date) {
    const user = await ctx.userList.getUser(login);

    if (!user) {
      return { error: "Пользователя с такми логином нет" };
    }
    if (!user.penaltys[penaltyId]) {
      return { error: "Такого штрафа нет" };
    }
    if (user.penaltys[penaltyId].status) {
      return { error: "Штраф уже оплачен" };
    }

    const date1 = new Date(date);
    const date2 = new Date(user.penaltys[penaltyId].date);

    const difference = date1.getTime() - date2.getTime();

    const difference_days = difference / (1000 * 3600 * 24);

    if (difference_days <= 5) {
      if (user.balance < 5) {
        return { error: "Не хватает денег на балансе" };
      }
      user.balance -= 5;
      user.unpaidPenaltys -= 1;
      user.penaltys[penaltyId].status = true;
      await ctx.bankList.increaseBalance(5);
      return await ctx.userList.setUser(login, user);
    }

    if (user.balance < 10) {
      return { error: "Не хватает денег на балансе" };
    }
    user.balance -= 10;
    user.unpaidPenaltys -= 1;
    user.penaltys[penaltyId].status = true;
    await ctx.bankList.increaseBalance(10);
    return await ctx.userList.setUser(login, user);
  }

  // фукнция для продления удостоверения. принимает контекст, логин вызвавшего и текущую дату с сервера
  async extendLicense(ctx, login, date) {
    const user = await ctx.userList.getUser(login);
    const license = await ctx.licensesList.getLicense(user.licenseNumber);

    if (!user || !license) {
      return { error: "Такого пользователя или лицензии не существует" };
    }

    const date1 = new Date(date);
    const date2 = new Date(license.validity);

    const difference = date2.getTime() - date1.getTime();

    const difference_days = difference / (1000 * 3600 * 24);

    if (difference_days > 30) {
      return {
        error:
          "Вы можете продлить удостоверение максимум за 30 дней до окончания срока действия",
      };
    }
    if (user.unpaidPenaltys > 0) {
      return {
        error: "Чтобы продлить удостоверение нужно оплатить все штрафы",
      };
    }

    // const validity =
    //   license.validity.slice(0, 6) +
    //   (parseInt(license.validity.slice(6, 10)) + 10);
    const validity = `${date1.getDate()}.${
      parseInt(date1.getMonth()) < 9
        ? "0" + (date1.getMonth() + 1)
        : date1.getMonth() + 1
    }.${parseInt(date1.getFullYear()) + 10}`;
    license.validity = validity;

    return await ctx.licensesList.setLicense(user.licenseNumber, license);
  }

  // Функция для добавления новой машины. принимает контекст, логин вызвавшего, категорию транспорта, цену и срок эксплуатации
  async addCar(ctx, login, category, price, term) {
    const user = await ctx.userList.getUser(login);

    if (!user) {
      return { error: "Пользователь не найден" };
    }
    if (user.licenseNumber == "") {
      return { error: "У вас нет водительских прав" };
    }

    const license = await ctx.licensesList.getLicense(user.licenseNumber);

    if (!license) {
      return { error: "Ошибка с водительскими правами" };
    }
    if (license.category != category) {
      return {
        error:
          "Категория удостоверения и категория добавляемой машины не совпадают",
      };
    }

    const car = new Car(category, price, term);
    user.cars.push(car);

    return await ctx.userList.setUser(login, user);
  }

  // функция для добавления удостоверения водителю. принимает логин водителя, номер удостоверения, его срок действия и категория
  async addDriverToLicense(ctx, login, number, validity, category) {
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
    return await ctx.userList.setUser(login, driver);
  }
}

module.exports.UserList = UserList;
module.exports.UserContract = UserContract;
