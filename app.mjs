import TelegramBot from 'node-telegram-bot-api';
import checkifUserIsAdmin from "./adminCheck.mjs"
import { DateTime } from "luxon";
import axios from 'axios';
import NodeCache from 'node-cache';
import mysql from 'mysql';
import express from 'express';
const app = express();
const token = "7237081474:AAGsSnjPvvr1RLOgdrQjA9XNl-JrV0bQ-5o";
const bot = new TelegramBot(token, {
    polling: true,
});

//初始化一个mysql数据库实例
const connection = mysql.createConnection({
    host: '47.76.223.250',
    port: '3306',
    user: 'root',
    password: 'Qwer1234..',
    database: 'bot'
});

// 创建一个缓存实例，设置缓存过期时间为 10 秒
const myCache = new NodeCache({ stdTTL: 1800 });

//下发缓存key
const isueCacheKey = 'isueCacheKey';
//+钱缓存key
const inComingRecordKey = 'inComingRecordKey';

const incomingRecords = [];
const outgoingRecords = [];
const issueRecordsArr = [];
// 替换成OKEx的API接口地址
const apiUrl = 'https://www.okx.com/api/v5/market/tickers?instType=SPOT';

// OKEx 公共接口 URL (请根据 OKEx 官方文档更新)
const baseUrl = 'https://www.okx.com/api/v5/market/';

// 假设 messages 是一个数组，用来存储最近的几条消息
let messages = [];
//今日交易数据
let todayTransaction = [];
//下发今日交易数据
let issueTodayTransaction = [];
let issueRecords = [];
let billingStyle = [];
let issUeStyle = [];
let outIssyedStyle = [];


let fixedRate = 0.00; //全局变量汇率
let rate = 0.00; //全局变量费率

let dailyTotalAmount = 0.00; //入款总金额
let numberofEntries = 0; //入账笔数
let issueofEntries = 0; //下发笔数
let showldBeIssued = 0.00; //应下发金额
let showldBeIssuedRmb = 0.00; //应下发金额rmb
let issued = 0.00; //已下发金额
let issuedRmb = 0.00; //已下发金额rmb
let unissued = 0.00; //未下发金额
let unissuedRmb = 0.00; //未下发金额Rmb

// 替换为你的 OKEx API 密钥和密钥秘钥
const apiKey = '56b9768f-1b05-4225-b3b9-ae1e29afe22d';
const secretKey = '2A178FE570AD0E75A3C7679B07681C55';


// 构造请求头
const headers = {
    'Content-Type': 'application/json',
    'OK-ACCESS-KEY': "56b9768f-1b05-4225-b3b9-ae1e29afe22d",
    'OK-ACCESS-PASSPHRASE': "Asdzxc1230.",
    'OK-ACCESS-TIMESTAMP': Date.now() / 1000
    // ... 其他需要的头部信息，根据OKEx API文档
};

bot.on("message", async (msg) => {
    // 将当前消息添加到缓存中
    messages.push(msg);

    // 如果缓存超过一定长度，移除最旧的消息
    if (messages.length > 10) {
        messages.shift();
    }

    // 获取上一条消息
    const previousMessage = messages[messages.length - 2];
    if (previousMessage) {
        // 使用上一条消息
        console.log("上一条消息:", previousMessage.text);
    }



    const chatId = msg.chat.id;
    const messageText = msg.text;
    const messageId = msg.message_id;
    const boostId = msg.from.id;

    try {
        const isAdmin = await checkifUserIsAdmin(bot, msg);
        if (isAdmin === 1) {
            const originalMessageId = msg.message_id;
            try {
                if (messageText.startsWith("设置汇率")) {
                    const numberMatch = messageText.match(/(\d+(\.\d{1,2})?)/);
                    if (numberMatch) {
                        let num = Number(numberMatch[0]);
                        fixedRate = parseFloat(num.toFixed(2));
                        // fixedRate = Number(numberMatch[0]).toFixed(2);

                        console.log("保留2位小数", fixedRate);
                        bot.sendMessage(chatId, "汇率设置成功! 当前汇率: " + fixedRate, {
                            reply_to_message_id: originalMessageId,
                        });
                    } else {
                        console.log("消息中没用匹配数据");
                    }
                }
            } catch (error) {
                console.error("判断管理员权限出现错误");
            }

            try {
                if (messageText.startsWith("设置费率")) {
                    const numberRate = messageText.match(/(\d+(\.\d{1,2})?)/);
                    if (numberRate) {
                        let num = Number(numberRate[0]);
                        rate = parseFloat(num.toFixed(2));
                        // rate = Number(numberRate[0]).toFixed(2);
                        bot.sendMessage(chatId, "费率设置成功！当前费率：" + rate, {
                            reply_to_message_id: originalMessageId,
                        });
                    }
                }
            } catch (error) {
                console.error("处理费率命令出现错误：", error);
            }
            try {
                if (messageText.startsWith("下发")) {
                    const numberMatch = messageText.match(/(\d+(\.\d{1,2})?)/);
                    if (numberMatch) {
                        let num = Number(numberMatch[0]);
                        const amountReceived = parseFloat(num.toFixed(2));
                        let s = Number(amountReceived);

                        if (fixedRate !== null) {

                            dailyTotalAmount = (parseFloat(s) + Number(dailyTotalAmount)).toFixed(2);

                            // if (fixedRate === 0.00) {

                            //     console.log("除数不能为零");
                            //     bot.sendMessage(chatId, "汇率为零，请先设置汇率!");
                            //     return;
                            // }
                            if (fixedRate === 0) {
                                const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd');
                                fixedRate = response.data.tether.usd.toFixed(2);
                            }
                            showldBeIssued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                            showldBeIssuedRmb = (dailyTotalAmount / parseFloat(fixedRate) * parseFloat(fixedRate)).toFixed(2);

                            //已下发金额 = 入款总金额
                            issued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                            issuedRmb = (dailyTotalAmount / parseFloat(fixedRate) * fixedRate).toFixed(2);

                            //未下发金额 = 入款总金额 - 已下发金额
                            unissued = (parseFloat(dailyTotalAmount - issued) / fixedRate).toFixed(2);

                            unissuedRmb = (parseFloat(dailyTotalAmount - issued) * fixedRate).toFixed(2);

                            numberofEntries += 1;
                            issueofEntries += 1;
                            await handleIssueRecords(amountReceived, fixedRate);
                            issueRecords = await issueSendRecordsToUser(issueRecordsArr);
                            await sendPymenTemplate(chatId,
                                dailyTotalAmount,
                                showldBeIssued,
                                issued,
                                unissued,
                                numberofEntries,
                                billingStyle,
                                issueRecords,
                                issueofEntries);

                        } else {
                            bot.sendMessage(chatId, "请先设置汇率!")
                        }
                    }
                }

                if (messageText === "z0") {
                    const isAdmin = await checkifUserIsAdmin(bot, msg);
                    if (isAdmin === 1) {
                        try {
                            await handleMessage(bot, msg);
                            // 获取所有交易对信息
                            // await getMarketData();
                        } catch (error) {
                            await bot.sendMessage(chatId, '获取数据失败，请稍后再试');
                        }
                    } else {
                        // 非管理员用户，返回提示信息
                        await bot.sendMessage(chatId, '您没有权限执行此操作');
                    }
                }

                if (messageText === "显示操作人") {
                    const isAdmin = await checkifUserIsAdmin(bot, msg);
                    if (isAdmin === 1) {
                        try {
                            app.get('/group/:groupId/admins', async (req, res) => {
                                const groupId = req.params.groupId;
                                try {
                                    const group = await Group.findByPk(groupId, {
                                        include: [{
                                            model: User,
                                            through: {
                                                where: {
                                                    permission: 'admin' // 这里假设 'admin' 权限表示管理机器人
                                                }
                                            }
                                        }]
                                    });

                                    if (!group) {
                                        return res.status(404).json({ message: '群组不存在' });
                                    }

                                    bot.sendMessage(chatId, group.Users, {
                                        reply_to_message_id: messageId,

                                    });
                                } catch (error) {
                                    console.error(error);
                                    res.status(500).json({ message: '服务器错误' });
                                }
                            });

                        } catch (error) {
                            await bot.sendMessage(chatId, '获取数据失败，请稍后再试');
                        }
                    } else {
                        // 非管理员用户，返回提示信息
                        await bot.sendMessage(chatId, '您没有权限执行此操作');
                    }
                }

                if (messageText === "+0") {
                    if (previousMessage) {
                        if (previousMessage.text === "删除账单") {
                            numberofEntries = 0;
                            issueofEntries = 0;
                            await deleteBillTemplate(chatId,
                                0,
                                0,
                                0,
                                0,
                                0,
                                0,
                                0,
                                0,
                                0,
                                0);
                            return;
                        }
                    } else {
                        const numberMatch = messageText.match(/(\d+(\.\d{1,2})?)/);
                        if (numberMatch) {
                            let num = Number(numberMatch[0]);
                            const amountReceived = parseFloat(num.toFixed(2));
                            let s = Number(amountReceived);
                            if (fixedRate !== null) {

                                // if (fixedRate === 0.00) {
                                //     console.log("除数不能为零");
                                //     bot.sendMessage(chatId, "汇率为零，请先设置汇率!");
                                //     return;
                                // }
                                if (fixedRate === 0) {
                                    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd');
                                    fixedRate = response.data.tether.usd.toFixed(2);
                                    console.log("官网实时固定汇率：>>>>>>>>>>>>>>>>" + fixedRate)
                                }

                                dailyTotalAmount = 0;

                                showldBeIssued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                                showldBeIssuedRmb = (dailyTotalAmount / parseFloat(fixedRate) * parseFloat(fixedRate)).toFixed(2);

                                //已下发金额 = 入款总金额
                                issued = (parseFloat(issued + dailyTotalAmount)).toFixed(2);

                                issuedRmb = (parseFloat(issued + dailyTotalAmount) * fixedRate).toFixed(2);

                                //未下发金额 = 入款总金额 - 已下发金额
                                unissued = (parseFloat(dailyTotalAmount - issued) / fixedRate).toFixed(2);

                                unissuedRmb = (parseFloat(dailyTotalAmount - issued) * fixedRate).toFixed(2);

                                numberofEntries += 0;
                                issueofEntries += 0;
                                // billingStyle = [];
                                // await handleIncomingRecord(amountReceived, fixedRate);
                                // await handleIssueRecords(amountReceived, fixedRate);
                                // const issueRecordsArr = myCache.get(inComingRecordKey);
                                billingStyle = await sendRecordsToUser(incomingRecords);
                                issueRecords = await issueSendRecordsToUser(issueRecordsArr);
                                await sendPymenTemplate(chatId,
                                    dailyTotalAmount,
                                    showldBeIssued,
                                    issued,
                                    unissued,
                                    numberofEntries,
                                    billingStyle,
                                    issueRecords,
                                    issueofEntries);
                                return;
                            } else {
                                bot.sendMessage(chatId, "请先设置汇率!")
                                return;
                            }
                        }
                    }
                }

                if (messageText.startsWith("+") && !checkForSpecialChars(messageText)) {
                    const numberMatch = messageText.match(/(\d+(\.\d{1,2})?)/);
                    if (numberMatch) {
                        let num = Number(numberMatch[0]);
                        const amountReceived = parseFloat(num.toFixed(2));
                        let s = Number(amountReceived);
                        if (fixedRate !== null) {

                            // if (fixedRate === 0.00) {
                            //     console.log("除数不能为零");
                            //     bot.sendMessage(chatId, "汇率为零，请先设置汇率!");
                            //     return;
                            // }
                            if (fixedRate === 0) {
                                const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd');
                                fixedRate = response.data.tether.usd.toFixed(2);
                                console.log("官网实时固定汇率：>>>>>>>>>>>>>>>>" + fixedRate)
                            }

                            dailyTotalAmount = (parseFloat(s) + Number(dailyTotalAmount)).toFixed(2);

                            showldBeIssued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                            showldBeIssuedRmb = (dailyTotalAmount / parseFloat(fixedRate) * parseFloat(fixedRate)).toFixed(2);

                            //已下发金额 = 入款总金额
                            issued = (parseFloat(issued + dailyTotalAmount)).toFixed(2);

                            issuedRmb = (parseFloat(issued + dailyTotalAmount) * fixedRate).toFixed(2);

                            //未下发金额 = 入款总金额 - 已下发金额
                            unissued = (parseFloat(dailyTotalAmount - issued) / fixedRate).toFixed(2);

                            unissuedRmb = (parseFloat(dailyTotalAmount - issued) * fixedRate).toFixed(2);

                            numberofEntries += 1;

                            await handleIncomingRecord(amountReceived, fixedRate);
                            // const issueRecordsArr = myCache.get(inComingRecordKey);
                            billingStyle = await sendRecordsToUser(incomingRecords);
                            await sendPymenTemplate(chatId,
                                dailyTotalAmount,
                                showldBeIssued,
                                issued,
                                unissued,
                                numberofEntries,
                                billingStyle,
                                issueRecords,
                                issueofEntries);
                            return;
                        } else {
                            bot.sendMessage(chatId, "请先设置汇率!")
                        }
                    }
                }

                //进行数字输入计算 
                if (messageText.startsWith("+") && !messageText.startsWith("设置")) {
                    const regex = /(-?\d+)(\/\d+(\.\d+)?)$/; // 修改捕获组
                    const match = messageText.match(regex);
                    if (match) {
                        const amount = parseFloat(match[1]);
                        const price = parseFloat(match[2].slice(1));
                        const result = parseFloat(amount / price).toFixed(2);
                        await bot.sendMessage(chatId, result, {
                            reply_to_message_id: messageId
                        });

                        const regex = /^\+?(\d+)(\/\d+)?$/;
                        const numberMatch = messageText.match(regex);
                        if (numberMatch) {
                            let num = Number(numberMatch[1]);
                            const amountReceived = parseFloat(num.toFixed(2));
                            let s = Number(amountReceived);
                            if (fixedRate !== null) {

                                if (fixedRate === 0) {
                                    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd');
                                    fixedRate = response.data.tether.usd.toFixed(2);
                                    console.log("官网实时固定汇率：>>>>>>>>>>>>>>>>" + fixedRate)
                                }

                                dailyTotalAmount = (parseFloat(s) + Number(dailyTotalAmount)).toFixed(2);

                                showldBeIssued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                                showldBeIssuedRmb = (dailyTotalAmount / parseFloat(fixedRate) * parseFloat(fixedRate)).toFixed(2);

                                //已下发金额 = 入款总金额
                                issued = (parseFloat(issued + dailyTotalAmount)).toFixed(2);

                                issuedRmb = (parseFloat(issued + dailyTotalAmount) * fixedRate).toFixed(2);

                                //未下发金额 = 入款总金额 - 已下发金额
                                unissued = (parseFloat(dailyTotalAmount - issued) / fixedRate).toFixed(2);

                                unissuedRmb = (parseFloat(dailyTotalAmount - issued) * fixedRate).toFixed(2);

                                numberofEntries += 1;
                                await handleIncomingRecord(amountReceived, fixedRate);
                                billingStyle = await sendRecordsToUser(incomingRecords);
                                console.log("查看格式化样式", billingStyle);
                                await sendPymenTemplate(chatId,
                                    dailyTotalAmount,
                                    showldBeIssued,
                                    issued,
                                    unissued,
                                    numberofEntries,
                                    billingStyle,
                                    issueRecords,
                                    issueofEntries);
                            }
                            return;
                        } else {
                            bot.sendMessage(chatId, "请先设置汇率!")
                        }

                        return;
                    } else {
                        bot.sendMessage(chatId, "请输入正确的数据格式")
                        return;
                    }
                }
                //进行数字输入计算 
                if (messageText.startsWith("-") && !messageText.startsWith("设置")) {
                    const regex = /(-?\d+)(\/\d+(\.\d+)?)$/; // 修改捕获组
                    const match = messageText.match(regex);
                    if (match) {
                        const amount = parseFloat(match[1]);
                        const price = parseFloat(match[2].slice(1));
                        const result = parseFloat(amount / price).toFixed(2);
                        await bot.sendMessage(chatId, result, {
                            reply_to_message_id: messageId
                        });

                        // const regex = /^-?\d+\/\d+$/;
                        // const numberMatch = messageText.match(regex);
                        // if (numberMatch) {
                        //     let num = Number(numberMatch[1]);
                        //     const amountReceived = parseFloat(num.toFixed(2));
                        //     let s = Number(amountReceived);
                        //     if (fixedRate !== null) {

                        //         if (fixedRate === 0) {
                        //             const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd');
                        //             fixedRate = response.data.tether.usd.toFixed(2);
                        //             console.log("官网实时固定汇率：>>>>>>>>>>>>>>>>" + fixedRate)
                        //         }

                        //         dailyTotalAmount = (parseFloat(s) + Number(dailyTotalAmount)).toFixed(2);

                        //         showldBeIssued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                        //         showldBeIssuedRmb = (dailyTotalAmount / parseFloat(fixedRate) * parseFloat(fixedRate)).toFixed(2);

                        //         //已下发金额 = 入款总金额
                        //         issued = (parseFloat(issued + dailyTotalAmount)).toFixed(2);

                        //         issuedRmb = (parseFloat(issued + dailyTotalAmount) * fixedRate).toFixed(2);

                        //         //未下发金额 = 入款总金额 - 已下发金额
                        //         unissued = (parseFloat(dailyTotalAmount) - parseFloat(issued)).toFixed(2);

                        //         unissuedRmb = (parseFloat(dailyTotalAmount - issued) * fixedRate).toFixed(2);

                        //         numberofEntries += 1;
                        //         await handleIncomingRecord(amountReceived, fixedRate);
                        //         billingStyle = await sendRecordsToUser(incomingRecords);
                        //         console.log("查看格式化样式", billingStyle);
                        //         await sendPymenTemplate(chatId,
                        //             dailyTotalAmount,
                        //             showldBeIssued,
                        //             issued,
                        //             unissued,
                        //             numberofEntries,
                        //             billingStyle,
                        //             issueRecords,
                        //             issueofEntries);
                        //     }
                        //     return;
                        // } else {
                        //     bot.sendMessage(chatId, "请先设置汇率!")
                        // }
                        return;
                    } else {
                        bot.sendMessage(chatId, "请输入正确的数据格式")
                        return;
                    }
                }

                //如果机器人接收到的指令是 - 做减法
                // if (messageText.startsWith("-")) {
                //     const numberMatch = messageText.match(/(\d+(\.\d{1,2})?)/);
                //     if (numberMatch) {
                //         let num = Number(numberMatch[0]);
                //         const amountReceived = parseFloat(num.toFixed(2));
                //         let s = Number(amountReceived);
                //         if (fixedRate !== null) {

                //             // if (fixedRate === 0.00) {
                //             //     console.log("除数不能为零");
                //             //     bot.sendMessage(chatId, "汇率为零，请先设置汇率!");
                //             //     return;
                //             // }

                //             if (fixedRate === 0) {
                //                 const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd');
                //                 fixedRate = response.data.tether.usd.toFixed(2);
                //             }

                //             dailyTotalAmount = (parseFloat(s) + Number(dailyTotalAmount)).toFixed(2);

                //             showldBeIssued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                //             showldBeIssuedRmb = (dailyTotalAmount / parseFloat(fixedRate) * parseFloat(fixedRate)).toFixed(2);

                //             //已下发金额 = 入款总金额
                //             issued = (parseFloat(issued + dailyTotalAmount)).toFixed(2);

                //             issuedRmb = (parseFloat(issued + dailyTotalAmount) * fixedRate).toFixed(2);

                //             //未下发金额 = 入款总金额 - 已下发金额
                //             unissued = (parseFloat(dailyTotalAmount) - parseFloat(issued)).toFixed(2);

                //             unissuedRmb = (parseFloat(dailyTotalAmount - issued) * fixedRate).toFixed(2);

                //             numberofEntries += 1;
                //             await handleIncomingRecord(amountReceived, fixedRate);
                //             billingStyle = await sendRecordsToUser(incomingRecords);
                //             console.log("查看格式化样式", billingStyle);
                //             await sendPymenTemplate(chatId,
                //                 dailyTotalAmount,
                //                 showldBeIssued,
                //                 issued,
                //                 unissued,
                //                 numberofEntries,
                //                 billingStyle);

                //         } else {
                //             bot.sendMessage(chatId, "请先设置汇率!")
                //         }
                //     }
                // }

                // //删除聊天机器人
                // try {
                //     if (messageText.startsWith("踢出")) {
                //         const isAdmin = await checkifUserIsAdmin(bot, msg);
                //         if (isAdmin === 1) {
                //             bot.logOut(true);
                //             bot.sendMessage(chatId, "已踢出");
                //         }
                //     }
                // } catch (error) {
                //     console.log("机器人删除失败!");
                //     throw error;
                // }
                try {
                    if (messageText === "删除账单") {
                        const isAdmin = await checkifUserIsAdmin(bot, msg);
                        if (isAdmin === 1) {
                            // bot.deleteMessage(chatId, messageId)
                            let s = Number(dailyTotalAmount);
                            dailyTotalAmount = (s).toFixed(2);

                            if (fixedRate === 0) {
                                const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd');
                                fixedRate = response.data.tether.usd.toFixed(2);
                            }

                            showldBeIssued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                            showldBeIssuedRmb = (dailyTotalAmount / parseFloat(fixedRate) * parseFloat(fixedRate)).toFixed(2);

                            //已下发金额 = 入款总金额
                            issued = (parseFloat(issued + dailyTotalAmount)).toFixed(2);

                            issuedRmb = (parseFloat(issued + dailyTotalAmount) * fixedRate).toFixed(2);

                            //未下发金额 = 入款总金额 - 已下发金额
                            unissued = (parseFloat(dailyTotalAmount - issued) / fixedRate).toFixed(2);

                            unissuedRmb = (parseFloat(unissued * fixedRate)).toFixed(2);

                            billingStyle = await sendRecordsToUser(incomingRecords);
                            console.log("查看格式化样式", billingStyle);

                            clearArray(incomingRecords);
                            clearArray(issueRecordsArr);
                            bot.sendMessage(chatId, "本次账单清理完成！", {
                                reply_to_message_id: originalMessageId
                            });
                        } else {
                            bot.sendMessage(chatId, "没有操作权限!")
                        }
                    }

                } catch (error) {
                    console.error("操作删除账单错误", error);
                    throw error;
                }

                if (messageText.startsWith("显示账单") || messageText === "账单") {

                    let s = Number(dailyTotalAmount);
                    dailyTotalAmount = (s).toFixed(2);

                    // if (fixedRate === 0.00) {
                    //     console.log("除数不能为零");
                    //     bot.sendMessage(chatId, "汇率为零，请先设置汇率!");
                    //     return;
                    // }

                    if (fixedRate === 0) {
                        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd');
                        fixedRate = response.data.tether.usd.toFixed(2);
                    }

                    showldBeIssued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                    showldBeIssuedRmb = (dailyTotalAmount / parseFloat(fixedRate) * parseFloat(fixedRate)).toFixed(2);

                    //已下发金额 = 入款总金额
                    issued = (parseFloat(issued + dailyTotalAmount)).toFixed(2);

                    issuedRmb = (parseFloat(issued + dailyTotalAmount) * fixedRate).toFixed(2);
                    //未下发金额 = 入款总金额 - 已下发金额
                    unissued = (parseFloat(dailyTotalAmount - issued) / fixedRate).toFixed(2);

                    unissuedRmb = (parseFloat(unissued * fixedRate)).toFixed(2);

                    numberofEntries += 1;
                    billingStyle = await sendRecordsToUser(incomingRecords);
                    console.log("查看格式化样式", billingStyle);
                    await sendPymenTemplate(chatId,
                        dailyTotalAmount,
                        showldBeIssued,
                        issued,
                        unissued,
                        numberofEntries,
                        billingStyle,
                        issueRecords,
                        issueofEntries);
                }

            } catch (error) {
                console.error("处理入账命令出错", error);
            }
        }
    } catch (error) {
        console.log("处理命令时出现错误", error);
        throw error;
    }
});

//+0账单模版
function deleteBillTemplate(chatId,
    dailyTotalAmount,
    showldBeIssued,
    issued,
    unissued,
    numberofEntries,
    issueofEntries,
    billingStyle,
    showldBeIssuedRmb,
    issuedRmb,
    unissuedRmb) {
    const keyboard = {
        inline_keyboard: [
            [
                { text: "公群导航", url: "https://t.me/dbcksq" },
                { text: "供求信息", url: "https://t.me/s/TelePlanting" },
            ],
        ],
    };

    const message = `<a href = "https://t.me/@Guik88">518</a>
    <b>入款(${numberofEntries}笔: )</b>
    ${billingStyle}
    <b>入款(${issueofEntries}笔: )</b>
    <b>入款总金额：</b>${dailyTotalAmount}
    <b>费率：</b>${rate}
    <b>固定汇率：</b>${fixedRate}
    <b>应下发：</b>${showldBeIssued}(USDT)${showldBeIssuedRmb}(RMB)
    <b>已下发：</b>${issued}(USDT)${issuedRmb}(RMB)
    <b>未下发：</b>${unissued}(USDT)${unissuedRmb}(RMB)
    `;

    bot.sendMessage(chatId, message, {
        parse_mode: "HTML",
        reply_markup: keyboard,
        disable_web_page_preview: true,
    });

}

//设置回复模版
function sendPymenTemplate(chatId,
    dailyTotalAmount,
    showldBeIssued,
    issued,
    unissued,
    numberofEntries,
    billingStyle,
    issueRecords,
    issueofEntries) {
    const keyboard = {
        inline_keyboard: [
            [
                { text: "公群导航", url: "https://t.me/dbcksq" },
                // { text: "供求信息", url: "https://t.me/s/TelePlanting" },
                { text: "点击跳转完整账单", url: "https://acbot.top/?id=" + chatId },
            ],
        ],
    };

    const message = `<a href = "https://t.me/@Guik88">518</a>
    <b>入款(${numberofEntries}笔:)</b>
    ${billingStyle.join('\n')}
    <b>下发(${issueofEntries}笔:)</b>
    ${issueRecords.join('\n')}
    <b>入款总金额：</b>${dailyTotalAmount}
    <b>费率：</b>${rate}
    <b>固定汇率：</b>${fixedRate}
    <b>应下发：</b>${showldBeIssued}(USDT)
    <b>已下发：</b>${issued}(USDT)
    <b>未下发：</b>${unissued}(USDT)
    `;

    bot.sendMessage(chatId, message, {
        parse_mode: "HTML",
        reply_markup: keyboard,
        disable_web_page_preview: true,
    });

}

//处理入款记录的函数
async function handleIncomingRecord(amountReceived, fixedRate) {
    const beijingTime = await getBeijingTime();
    console.log("查看时间格式", beijingTime);
    const timestamp = Math.floor(beijingTime.toMillis() / 1000);

    const convertedAmount = (amountReceived / fixedRate).toFixed(2);
    const incomingRecord = {
        timestamp: timestamp,
        amountReceived: amountReceived,
        fixedRate: fixedRate,
        convertedAmount: convertedAmount,
    };

    incomingRecords.unshift(incomingRecord);
}


//处理下发记录的函数
async function handleIssueRecords(amountReceived, fixedRate) {
    const beijingTime = await getBeijingTime();
    console.log("查看时间格式", beijingTime);
    const timestamp = Math.floor(beijingTime.toMillis() / 1000);

    const convertedAmount = (amountReceived * fixedRate).toFixed(2);
    const incomingRecord = {
        timestamp: timestamp,
        amountReceived: amountReceived,
        fixedRate: fixedRate,
        convertedAmount: convertedAmount,
    };

    issueRecordsArr.unshift(incomingRecord);
}

async function getBeijingTime() {
    const beijingTime = DateTime.now().setZone("Asia/Shanghai");
    return beijingTime;
}

async function sendRecordsToUser(records) {
    let recordsArr = [];
    let text = "";
    for (const incomingRecord of records) {
        const formattedRecord = await formatRecordText(incomingRecord);
        text = formattedRecord;
        recordsArr.unshift(text);
    }
    return recordsArr;
}
//发送下发记录
async function issueSendRecordsToUser(records) {
    let issSueArr = [];
    let text = "";
    for (const incomingRecord of records) {
        const formattedRecord = await issueFormatRecordText(incomingRecord);
        text = formattedRecord;
        issSueArr.unshift(text);
    }
    return issSueArr;
}

//处理已下发
async function issueFormatRecordText(records) {
    const options = {
        locale: "zh-CN",
        hour12: false,
    };
    const timestamp = new Date(records.timestamp * 1000).toLocaleTimeString(
        "zh-CN",
        options
    );
    const foormatRecordText = `${timestamp} ${records.amountReceived} * ${records.fixedRate} = ${records.convertedAmount}(RMB)`;
    return foormatRecordText;

}


async function formatRecordText(records) {
    const options = {
        locale: "zh-CN",
        hour12: false,
    };
    const timestamp = new Date(records.timestamp * 1000).toLocaleTimeString(
        "zh-CN",
        options
    );
    const foormatRecordText = `${timestamp} ${records.amountReceived} / ${records.fixedRate} = ${records.convertedAmount}`;
    return foormatRecordText;

}

//获取欧易usd实时汇率
async function getUsdtPrice() {
    try {
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd');
        const usdtPrice = response.data.tether.usd;
        console.log('USDT价格:', usdtPrice);
    } catch (error) {
        console.error('获取USDT价格失败:', error);
    }
}
//正则匹配校验是否包含（/ 或者 *）
function checkForSpecialChars(messageText) {
    const regex = /[\/\*]/; // 匹配 / 或 *
    return regex.test(messageText);
}

//删除聊天机器人
async function deleteChatBot() {
    const options = {
        chat: chat,
        boostId: boost_id,
        remove_date: remove_date,
        source: source
    }
}

//清空数组
function clearArray(arr) {
    arr.length = 0;
}

async function getTop10Rates(bot, msg, chatId) {
    const messageText = msg.text;

    if (messageText === "z0") {
        const isAdmin = await checkifUserIsAdmin(bot, msg);
        if (isAdmin === 1) {
            try {
                const response = await axios.get(apiUrl);
                const data = response.data;

                // 检查数据是否存在
                if (data && data.data) {
                    // 按价格排序并获取前10名
                    const top10Rates = data.data.sort((a, b) => parseFloat(b.last) - parseFloat(a.last)).slice(0, 10);

                    // 生成输出消息
                    let output = 'OKX 排行榜前十的币种汇率top10:\n';
                    top10Rates.forEach((item, index) => {
                        output += `${index + 1}. ${item.instId}: $${item.last}\n`;
                    });

                    // 发送结果
                    await bot.sendMessage(chatId, output);
                } else {
                    await bot.sendMessage(chatId, '无法获取数据，请稍后再试');
                }
            } catch (error) {
                console.error(error);
                await bot.sendMessage(chatId, '获取数据失败，请稍后再试');
            }
        } else {
            // 非管理员用户，返回提示信息
            await bot.sendMessage(chatId, '您没有权限执行此操作');
        }
    }
}

// 假设这是一个处理消息的函数
async function handleMessage(bot, msg) {
    const chatId = msg.chat.id;
    await getTop10Rates(bot, msg, chatId);
}


//第二种方案
// 获取所有交易对信息
async function getAllTradingPairs() {
    const response = await axios.get(`${baseUrl}/instruments`);
    return response.data.data;
}

// 计算交易对的交易量
async function calculateTradingVolume(tradingPair) {
    // 根据 OKEx 的交易量接口构造请求 URL
    const volumeUrl = `${baseUrl}/instruments/${tradingPair}/ticker`;
    const volumeResponse = await axios.get(volumeUrl);
    return volumeResponse.data.data.volume;
}

// 获取 Top 10 交易量币种
async function getTop10ByVolume() {
    const allPairs = await getAllTradingPairs();
    const pairsWithVolume = await Promise.all(
        allPairs.map(async (pair) => {
            const volume = await calculateTradingVolume(pair.instrument_id);
            return {
                pair: pair.instrument_id,
                volume,
            };
        })
    );

    // 根据交易量排序并取前 10 名
    const top10 = pairsWithVolume.sort((a, b) => b.volume - a.volume).slice(0, 10);
    return top10;
}

//第三种方案
// 获取市场数据的函数
async function getMarketData() {
    try {
        // 请求实时汇率数据
        const response = await axios.get(`${baseUrl}tickers`);

        // 从响应中提取数据
        const tickers = response.data.data;

        // 提取前 10 个交易对
        const top10Tickers = tickers.slice(0, 10);

        // 输出结果
        console.log('Top 10 Real-Time Tickers:');
        top10Tickers.forEach((ticker, index) => {
            console.log(`${index + 1}. Symbol: ${ticker.instId}, Last Price: ${ticker.last}`);
        });
    } catch (error) {
        console.error('Error fetching market data:', error.message);
    }
}

// 获取实时交易汇率数据的函数
async function getTop10Tickers() {
    try {
        // 请求实时汇率数据
        const response = await axios.get(`${BASE_URL}tickers`);

        // 从响应中提取数据
        const tickers = response.data.data;

        // 如果 tickers 数据为空，返回空结果
        if (!tickers || tickers.length === 0) {
            console.log('No ticker data available');
            return;
        }

        // 将数据按最新价格（last）降序排序
        tickers.sort((a, b) => parseFloat(b.last) - parseFloat(a.last));

        // 提取前 10 个交易对
        const top10Tickers = tickers.slice(0, 10);

        // 输出结果
        console.log('Top 10 Real-Time Tickers:');
        top10Tickers.forEach((ticker, index) => {
            console.log(`${index + 1}. Symbol: ${ticker.instId}, Last Price: ${ticker.last}, Change: ${ticker.change}`);
        });
    } catch (error) {
        console.error('Error fetching market data:', error.message);
    }
}