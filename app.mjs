import TelegramBot from 'node-telegram-bot-api';
import checkifUserIsAdmin from './adminCheck.mjs';
import { DateTime } from 'luxon';
import Redis from 'ioredis';
import axios from 'axios';
import express from 'express';


const app = express();
const token = '7237081474:AAGsSnjPvvr1RLOgdrQjA9XNl-JrV0bQ-5o';
const bot = new TelegramBot(token, {
    polling: true,
});

const host = '8.217.124.68';
// redis缓存
const cache = new Redis({
    host: host,
    port: 6379,
    db: 0,
    password: 123456,
    retryStrategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
            // Handle ECONNREFUSED differently
            console.error('Redis connection refused');
            return new Error('Redis connection refused');
        }

        if (options.attempt > 10) {
            // End reconnecting on a specific error and flush all commands with
            // individual error
            console.error('Redis connection failed after 10 attempts');
            return new Error('Too many retry attempts');
        }

        if (options.total_retry_time > 1000 * 60 * 5) {
            // End reconnecting after a specific timeout and flush all commands
            // with individual error
            console.error('Redis connection failed after 5 minutes');
            return new Error('Retry time exhausted');
        }

        if (options.error !== undefined && options.error.code === 'ECONNRESET' && options.attempt < 10) {
            // End reconnecting on a specific error and flush all commands with
            // individual error
            console.error('Redis connection reset');
            return new Error('Redis connection reset');
        }

        // reconnect after
        return Math.min(options.attempt * 100, 3000);
    },
    connect_timeout: 1000, // 连接超时时间
    idleTimeout: 60000
});

// 缓存 应下发 已下发 未下发key
const CACHE_KEY_SHOULD_BE_ISSUED = 'shouldBeIssued';
const CACHE_KEY_HAS_BEEN_ISSUED = 'hasBeenIssued';
const CACHE_KEY_HAS_NOT_BEEN_ISSUED = 'hasNotBeenIssued';

const incomingRecords = [];
const billingStyleZeroRecords = [];
const issueRecordsArr = [];
// 替换成OKEx的API接口地址
const apiUrl = 'https://www.okx.com/v3/c2c/tradingOrders/books?quoteCurrency=CNY&baseCurrency=USDT&side=sell&paymentMethod=all&userType=all&receivingAds=false&t=';

// OKEx 公共接口 URL (请根据 OKEx 官方文档更新)
const baseUrl = 'https://www.okx.com/api/v5/market/';

// 假设 messages 是一个数组，用来存储最近的几条消息
let messages = [];
let issueRecords = [];
let billingStyle = [];
let billingStyleZero = [];
let newRecords = [];


let fixedRate = 0.00; //全局变量汇率
let rate = 0.00; //全局变量费率

let dailyTotalAmount = 0.00; //入款总金额
let numberofEntries = 0; //入账笔数
let issueofEntries = 0; //下发笔数
let showldBeIssued = 0.00; //应下发金额

let showldBeIssueds = 0.00; //应下发 过滤金额

let showldBeIssuedRmb = 0.00; //应下发金额rmb
let issued = 0.00; //已下发金额
let issuedRmb = 0.00; //已下发金额rmb
let unissued = 0.00; //未下发金额
let unissueds = 0.00; //未下发的额度
let unissuedRmb = 0.00; //未下发金额Rmb

// 构造请求头
const headers = {
    'Content-Type': 'application/json',
    'OK-ACCESS-KEY': '56b9768f-1b05-4225-b3b9-ae1e29afe22d',
    'OK-ACCESS-PASSPHRASE': 'Asdzxc1230.',
    'OK-ACCESS-TIMESTAMP': Date.now() / 1000
    // ... 其他需要的头部信息，根据OKEx API文档
};

let botInfo = await bot.getMe();
bot.on('new_chat_members', async (msg) => {
    if (msg && msg.new_chat_member.id === botInfo.id) {
        cache.set('owner:' + msg.chat.id, msg.from.username);
        bot.sendMessage(msg.chat.id, '感谢您把我添加到贵群！');
    }
});

bot.on('message', async (msg) => {
    if (!msg || msg.new_chat_member || msg.left_chat_member) {
        return;
    }
    // 将当前消息添加到缓存中
    messages.push(msg);

    // 如果缓存超过一定长度，移除最旧的消息
    if (messages.length > 10) {
        messages.shift();
    }
    // 获取上一条消息
    const previousMessage = messages[messages.length - 2];
    const userId = msg.from.id;
    const userName = msg.from.username;
    let replyUserId = userId;
    const chatId = msg.chat.id;
    const messageText = msg.text;
    const messageId = msg.message_id;
    const boostId = msg.from.id;

    try {
        const isOperate = cache.exists('operator:' + chatId + '_' + userName) || cache.get('owner:' + chatId) === userName;
        if (isOperate && messageText) {
            if (messageText === '显示操作人' || messageText === '设置群操作人' || messageText.includes('操作人 @')) {
                let owner = await cache.get('owner:' + chatId);
                let text = '当前操作人 ' + (owner ? '@' + owner : '未设置');
                if (messageText === '设置群操作人' && msg.chat.type === 'supergroup') {
                    let users = await bot.getChatAdministrators(chatId);
                    let pipeline = cache.pipeline();
                    for (let user of users) {
                        if (user.user.username !== owner) {
                            pipeline.hset('operator:' + msg.chat.id, user.user.username, '');
                        }
                    }
                    await pipeline.exec((error, replies) => {
                        if (error) {
                            console.error('pipeline error:' + error);
                        } else {
                            text = '添加操作人成功！' + text;
                        }
                    });
                } else if (messageText.startsWith('设置操作人 @')) {
                    let users = messageText.substring(7).split(' @');
                    let pipeline = cache.pipeline();
                    for (let user of users) {
                        pipeline.hset('operator:' + msg.chat.id, user.trim(), '');
                    }
                    await pipeline.exec((error, replies) => {
                        if (error) {
                            console.error('pipeline error:' + error);
                        } else {
                            text = '添加操作人成功！' + text;
                        }
                    });
                } else if (messageText.startsWith('删除操作人 @')) {
                    await cache.hdel('operator:' + chatId, messageText.substring(7).split(' @'));
                    text = '删除操作人成功！' + text;
                }
                cache.hkeys('operator:' + chatId, async (error, fields) => {
                    if (error) {
                        console.error('Error fetching fields:', error);
                    } else {
                        for (let field of fields) {
                            text += ' @' + field;
                        }
                        await bot.sendMessage(chatId, text, {
                            reply_to_message_id: messageId,
                        });
                    }
                });
            }
        }

        const originalMessageId = msg.message_id;
        try {
            if (messageText.startsWith('设置汇率')) {
                const numberMatch = messageText.match(/(\d+(\.\d{1,2})?)/);
                if (numberMatch) {
                    let num = Number(numberMatch[0]);
                    fixedRate = parseFloat(num.toFixed(2));
                    // fixedRate = Number(numberMatch[0]).toFixed(2);

                    console.log('保留2位小数', fixedRate);
                    bot.sendMessage(chatId, '汇率设置成功! 当前汇率: ' + fixedRate, {
                        reply_to_message_id: originalMessageId,
                    });
                } else {
                    console.log('消息中没用匹配数据');
                }
            }
        } catch (error) {
            console.error('判断管理员权限出现错误');
        }

        try {
            if (messageText.startsWith('设置费率')) {
                const numberRate = messageText.match(/(-?\d+(\.\d{1,2})?)/);
                if (numberRate) {
                    let num = Number(numberRate[0]);
                    rate = parseFloat(num.toFixed(2));
                    // rate = Number(numberRate[0]).toFixed(2);
                    bot.sendMessage(chatId, '费率设置成功！当前费率：' + rate, {
                        reply_to_message_id: originalMessageId,
                    });
                }
            }
        } catch (error) {
            console.error('处理费率命令出现错误：', error);
        }
        try {
            if (messageText.startsWith('下发')) {
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
                            const response = await axios.get(apiUrl + Date.now(), {
                                headers: {
                                    'User-Agent': ''
                                }
                            });
                            fixedRate = response.data.data.sell[0].price;
                        }
                        showldBeIssueds = showldBeIssued;
                        // showldBeIssued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                        showldBeIssuedRmb = (dailyTotalAmount / parseFloat(fixedRate) * parseFloat(fixedRate)).toFixed(2);

                        //已下发金额 = 入款总金额
                        issued += s;

                        issuedRmb = (parseFloat(issued * fixedRate)).toFixed(2);

                        if (billingStyleZeroRecords.length === 0) {
                            unissued = 0;
                            unissuedRmb = 0;
                        } else {
                            //未下发金额 = 入款总金额 - 已下发金额
                            unissued = (parseFloat(showldBeIssueds - issued)).toFixed(2);
                            unissuedRmb = (parseFloat(showldBeIssueds - issued) * fixedRate).toFixed(2);
                        }

                        numberofEntries += 1;
                        issueofEntries += 1;
                        await handleIssueRecords(amountReceived, fixedRate);
                        issueRecords = await issueSendRecordsToUser(issueRecordsArr);
                        await sendPymenTemplate(chatId,
                            dailyTotalAmount,
                            showldBeIssueds,
                            issued,
                            unissued,
                            numberofEntries,
                            billingStyle,
                            issueRecords,
                            issueofEntries,
                            showldBeIssuedRmb,
                            issuedRmb,
                            unissuedRmb);

                    } else {
                        bot.sendMessage(chatId, '请先设置汇率!');
                    }
                }
            }

            if (messageText.startsWith('移除管理 @')) {
                let user = await cache.get('user:' + messageText.split('@')[1]);
                await bot.promoteChatMember(chatId, JSON.parse(JSON.parse(user)).userId, {
                    can_change_info: false,        // 修改群组信息
                    can_delete_messages: false,    // 删除信息
                    can_restrict_members: false,   // 封禁成员
                    can_invite_users: false,       // 添加成员
                    can_pin_messages: false,       // 置顶消息
                    can_promote_members: false     // 添加管理员
                });
                await sendMessage(chatId, messageId, '移除管理');
            }

            if (messageText === '踢出') {
                await bot.banChatMember(chatId, replyUserId, {});
                await sendMessage(chatId, messageId, messageText);
            }

            if (messageText.startsWith('踢出 @')) {
                let user = await cache.get('user:' + messageText.split(' @')[1]);
                await bot.banChatMember(chatId, JSON.parse(JSON.parse(user)).userId, {});
                await sendMessage(chatId, messageId, '踢出');
            }

            if (messageText === 'z0') {
                const isAdmin = await checkifUserIsAdmin(bot, msg);
                if (isAdmin) {
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

            if (messageText === '显示操作人') {
                const isAdmin = await checkifUserIsAdmin(bot, msg);
                if (isAdmin) {
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

            if (messageText === '开始记账' || messageText === '开始') {
                bot.sendMessage(chatId, '记账功能开始工作');
            }

            if (messageText === '+0') {
                if (previousMessage !== undefined && previousMessage.text === '删除账单') {
                    //初始化数组默认值为0
                    billingStyle = Array.from({ length: 1 }, () => 0);
                    issueRecords = Array.from({ length: 1 }, () => 0);
                    dailyTotalAmount = 0;
                    showldBeIssued = 0;
                    issued = 0;
                    unissued = 0;
                    numberofEntries = 0;
                    issueofEntries = 0;
                    showldBeIssuedRmb = 0;
                    issuedRmb = 0;
                    unissuedRmb = 0;
                    await deleteBillTemplate(chatId,
                        dailyTotalAmount,
                        showldBeIssued,
                        issued,
                        unissued,
                        numberofEntries,
                        issueofEntries,
                        billingStyle,
                        showldBeIssuedRmb,
                        issuedRmb,
                        unissuedRmb);
                    return;
                } else {
                    const numberMatch = messageText.match(/(\d+(\.\d{1,2})?)/);
                    if (numberMatch) {
                        let num = Number(numberMatch[0]);
                        const amountReceived = parseFloat(num.toFixed(2));
                        let s = Number(amountReceived);
                        if (fixedRate !== null) {
                            if (fixedRate === 0) {
                                const response = await axios.get(apiUrl + Date.now(), {
                                    headers: {
                                        'User-Agent': ''
                                    }
                                });
                                fixedRate = response.data.data.sell[0].price;
                                console.log('官网实时固定汇率：>>>>>>>>>>>>>>>>' + fixedRate);
                            }

                            dailyTotalAmount = (parseFloat(s) + Number(dailyTotalAmount)).toFixed(2);

                            showldBeIssued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                            showldBeIssuedRmb = (dailyTotalAmount / parseFloat(fixedRate) * parseFloat(fixedRate)).toFixed(2);

                            // //已下发金额 = 入款总金额
                            // issued = (parseFloat(issued + dailyTotalAmount)).toFixed(2);

                            // issuedRmb = (parseFloat(issued + dailyTotalAmount) * fixedRate).toFixed(2);

                            //未下发金额 = 入款总金额 - 已下发金额
                            unissued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                            unissuedRmb = (dailyTotalAmount / parseFloat(fixedRate) * parseFloat(fixedRate)).toFixed(2);
                            if (rate !== '0' && rate > 0) {
                                let amountReceiveds = 0;
                                amountReceiveds = amountReceived - amountReceived * rate / 100;
                                await handleIncomingRecordAddZero(amountReceiveds, fixedRate);
                            } else if (rate !== '0' && rate < 0) {
                                let amountReceiveds = 0;
                                amountReceiveds = amountReceived - amountReceived * rate / 100;
                                await handleIncomingRecordAddZero(amountReceiveds, fixedRate);
                            }
                            // const issueRecordsArr = myCache.get(inComingRecordKey);
                            if (billingStyle === undefined || issueRecords === undefined) {
                                billingStyle = Array.from({ length: 1 }, () => 0);
                                issueRecords = Array.from({ length: 1 }, () => 0);
                            } else {
                                billingStyle = await sendRecordsToUser(billingStyleZeroRecords);
                            }
                            await sendPymenTemplate(chatId,
                                dailyTotalAmount,
                                showldBeIssued,
                                issued,
                                unissued,
                                numberofEntries,
                                billingStyle,
                                issueRecords,
                                issueofEntries,
                                showldBeIssuedRmb,
                                issuedRmb,
                                unissuedRmb);
                            return;

                        } else {
                            bot.sendMessage(chatId, '请先设置汇率!');
                        }
                    }

                    return;
                }
            }

            if (messageText.startsWith('+') && !checkForSpecialChars(messageText)) {
                const numberMatch = messageText.match(/(\d+(\.\d{1,2})?)/);
                if (numberMatch) {
                    let num = Number(numberMatch[0]);
                    const amountReceived = parseFloat(num.toFixed(2));
                    let s = Number(amountReceived);
                    if (fixedRate !== null) {
                        if (fixedRate === 0) {
                            const response = await axios.get(apiUrl + Date.now(), {
                                headers: {
                                    'User-Agent': ''
                                }
                            });
                            fixedRate = response.data.data.sell[0].price;
                            console.log('官网实时固定汇率：>>>>>>>>>>>>>>>>' + fixedRate);
                        }

                        dailyTotalAmount = (parseFloat(s) + Number(dailyTotalAmount)).toFixed(2);

                        showldBeIssued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                        showldBeIssuedRmb = (dailyTotalAmount / parseFloat(fixedRate) * parseFloat(fixedRate)).toFixed(2);

                        //已下发金额 = 入款总金额
                        // issued = (parseFloat(issued + dailyTotalAmount)).toFixed(2);

                        // issuedRmb = (parseFloat(issued + dailyTotalAmount) * fixedRate).toFixed(2);

                        //未下发金额 = 入款总金额 - 已下发金额
                        unissued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                        unissuedRmb = (dailyTotalAmount / parseFloat(fixedRate) * parseFloat(fixedRate)).toFixed(2);

                        if (messageText === '+0') {
                            await handleIncomingRecord(amountReceived, fixedRate);
                            numberofEntries === 0;
                            newRecords = new Array(incomingRecords.length).fill(0);
                            billingStyleZero = await sendRecordsToUser(newRecords);
                            await sendPymenTemplateAddZero(chatId,
                                dailyTotalAmount,
                                showldBeIssued,
                                issued,
                                unissued,
                                numberofEntries,
                                billingStyleZero,
                                issueRecords,
                                issueofEntries,
                                showldBeIssuedRmb,
                                issuedRmb,
                                unissuedRmb);
                            return;
                        } else {
                            numberofEntries += 1;
                            if (rate !== '0' && rate > 0) {
                                let amountReceiveds = 0;
                                amountReceiveds = amountReceived - amountReceived * rate / 100;
                                await handleIncomingRecordAddZero(amountReceiveds, fixedRate);
                            } else if (rate !== '0' && rate < 0) {
                                let amountReceiveds = 0;
                                amountReceiveds = amountReceived - amountReceived * rate / 100;
                                await handleIncomingRecordAddZero(amountReceiveds, fixedRate);
                            } else {
                                await handleIncomingRecordAddZero(amountReceived, fixedRate);
                            }

                            billingStyle = await sendRecordsToUser(billingStyleZeroRecords);
                            // const issueRecordsArr = myCache.get(inComingRecordKey);
                            await sendPymenTemplate(chatId,
                                dailyTotalAmount,
                                showldBeIssued,
                                issued,
                                unissued,
                                numberofEntries,
                                billingStyle,
                                issueRecords,
                                issueofEntries,
                                showldBeIssuedRmb,
                                issuedRmb,
                                unissuedRmb);
                            return;
                        }

                    } else {
                        bot.sendMessage(chatId, '请先设置汇率!');
                    }
                }
            }

            //进行数字输入计算
            if (messageText.startsWith('+') && !messageText.startsWith('设置')) {
                const regex = /(-?\d+)(\/\d+(\.\d+)?)$/; // 修改捕获组
                const match = messageText.match(regex);
                if (match) {
                    const amount = parseFloat(match[1]);
                    const price = parseFloat(match[2].slice(1));
                    const result = parseFloat(amount / price).toFixed(2);
                    await bot.sendMessage(chatId, result, {
                        reply_to_message_id: messageId
                    });
                    const amountReceived = parseFloat(amount.toFixed(2));
                    let s = Number(amountReceived);
                    if (fixedRate !== null) {
                        if (fixedRate === 0) {
                            const response = await axios.get(apiUrl + Date.now(), {
                                headers: {
                                    'User-Agent': ''
                                }
                            });
                            fixedRate = response.data.data.sell[0].price;
                            console.log('官网实时固定汇率：>>>>>>>>>>>>>>>>' + fixedRate);
                        }
                        if (price !== 0) {
                            dailyTotalAmount = (parseFloat(s) + Number(dailyTotalAmount)).toFixed(2);

                            let result = amount / price;

                            showldBeIssueds = parseFloat(Number(result) + Number(showldBeIssued)).toFixed(2);

                            showldBeIssuedRmb = (showldBeIssueds * parseFloat(fixedRate)).toFixed(2);

                            //已下发金额 = 入款总金额
                            // issued = (parseFloat(issued + dailyTotalAmount)).toFixed(2);

                            // issuedRmb = (parseFloat(issued + dailyTotalAmount) * fixedRate).toFixed(2);

                            //未下发金额 = 入款总金额 - 已下发金额

                            unissueds = parseFloat(Number(showldBeIssueds) - Number(issued)).toFixed(2);

                            unissuedRmb = (unissueds * parseFloat(fixedRate)).toFixed(2);

                            await handleIncomingRecordAddZero(amountReceived, price);
                            billingStyle = await sendRecordsToUser(billingStyleZeroRecords);
                        } else {
                            dailyTotalAmount = (parseFloat(s) + Number(dailyTotalAmount)).toFixed(2);

                            showldBeIssued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                            showldBeIssuedRmb = (dailyTotalAmount / parseFloat(fixedRate) * parseFloat(fixedRate)).toFixed(2);

                            //已下发金额 = 入款总金额
                            // issued = (parseFloat(issued + dailyTotalAmount)).toFixed(2);

                            // issuedRmb = (parseFloat(issued + dailyTotalAmount) * fixedRate).toFixed(2);

                            //未下发金额 = 入款总金额 - 已下发金额
                            unissued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                            unissuedRmb = (dailyTotalAmount / parseFloat(fixedRate) * parseFloat(fixedRate)).toFixed(2);
                            await handleIncomingRecord(amountReceived, fixedRate);
                            billingStyle = await sendRecordsToUser(incomingRecords);
                        }
                        numberofEntries += 1;
                        // const issueRecordsArr = myCache.get(inComingRecordKey);
                        await sendPymenTemplate(chatId,
                            dailyTotalAmount,
                            showldBeIssueds,
                            issued,
                            unissueds,
                            numberofEntries,
                            billingStyle,
                            issueRecords,
                            issueofEntries,
                            showldBeIssuedRmb,
                            issuedRmb,
                            unissuedRmb);
                        return;
                    } else {
                        bot.sendMessage(chatId, '请输入正确的金额!');
                    }
                    return;
                }
                const regexs = /^[-+]?(\d+(\.\d+)?|\.\d+)([-+*\/][-]?(\d+(\.\d+)?|\.\d+))*$/;
                if (messageText.match(regexs)) {
                    if (messageText.match(regexs)) {
                        const amount = parseFloat(messageText.match(regexs)[1]);
                        const price = parseFloat(messageText.match(regexs)[4]);
                        const result = parseFloat(amount * price).toFixed(2);
                        await bot.sendMessage(chatId, result, {
                            reply_to_message_id: messageId
                        });
                        return;
                    }
                    const regex = /^\+?(\d+)(\/\d+)?$/;
                    const numberMatch = messageText.match(regex);
                    if (numberMatch) {
                        let num = Number(numberMatch[1]);
                        const amountReceived = parseFloat(num.toFixed(2));
                        let s = Number(amountReceived);
                        if (fixedRate !== null) {

                            if (fixedRate === 0) {
                                const response = await axios.get(apiUrl + Date.now(), {
                                    headers: {
                                        'User-Agent': ''
                                    }
                                });
                                fixedRate = response.data.data.sell[0].price;
                                console.log('官网实时固定汇率：>>>>>>>>>>>>>>>>' + fixedRate);
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
                            console.log('查看格式化样式', billingStyle);
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
                        bot.sendMessage(chatId, '请先设置汇率!');
                    }

                    return;
                } else {
                    bot.sendMessage(chatId, '请输入正确的数据格式');
                    return;
                }
            }
            //进行数字输入计算
            if (messageText.startsWith('-') && !messageText.startsWith('设置')) {
                const regex = /(-?\d+)(\/\d+(\.\d+)?)$/; // 修改捕获组
                const match = messageText.match(regex);
                if (match) {
                    const amount = parseFloat(match[1]);
                    const price = parseFloat(match[2].slice(1));
                    const result = parseFloat(amount / price).toFixed(2);
                    await bot.sendMessage(chatId, result, {
                        reply_to_message_id: messageId
                    });
                    const amountReceived = parseFloat(amount.toFixed(2));
                    let s = Number(amountReceived);
                    if (fixedRate !== null) {
                        if (fixedRate === 0) {
                            const response = await axios.get(apiUrl + Date.now(), {
                                headers: {
                                    'User-Agent': ''
                                }
                            });
                            fixedRate = response.data.data.sell[0].price;
                            console.log('官网实时固定汇率：>>>>>>>>>>>>>>>>' + fixedRate);
                        }
                        if (price !== 0) {
                            dailyTotalAmount = (parseFloat(s) + Number(dailyTotalAmount)).toFixed(2);

                            let result = amount / price;

                            showldBeIssueds = parseFloat(Number(showldBeIssued) + Number(result)).toFixed(2);

                            showldBeIssuedRmb = (showldBeIssueds * parseFloat(fixedRate)).toFixed(2);

                            //已下发金额 = 入款总金额
                            // issued = (parseFloat(issued + dailyTotalAmount)).toFixed(2);

                            // issuedRmb = (parseFloat(issued + dailyTotalAmount) * fixedRate).toFixed(2);

                            //未下发金额 = 入款总金额 - 已下发金额

                            unissueds = parseFloat(Number(showldBeIssueds) - Number(issued) + Number(result)).toFixed(2);

                            unissuedRmb = (unissueds * parseFloat(fixedRate)).toFixed(2);

                            await handleIncomingRecordAddZero(amountReceived, price);
                            billingStyle = await sendRecordsToUser(billingStyleZeroRecords);
                        } else {
                            dailyTotalAmount = (parseFloat(s) + Number(dailyTotalAmount)).toFixed(2);

                            showldBeIssued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                            showldBeIssuedRmb = (dailyTotalAmount / parseFloat(fixedRate) * parseFloat(fixedRate)).toFixed(2);

                            //已下发金额 = 入款总金额
                            // issued = (parseFloat(issued + dailyTotalAmount)).toFixed(2);

                            // issuedRmb = (parseFloat(issued + dailyTotalAmount) * fixedRate).toFixed(2);

                            //未下发金额 = 入款总金额 - 已下发金额
                            unissued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                            unissuedRmb = (dailyTotalAmount / parseFloat(fixedRate) * parseFloat(fixedRate)).toFixed(2);
                            await handleIncomingRecord(amountReceived, fixedRate);
                            billingStyle = await sendRecordsToUser(incomingRecords);
                        }
                        numberofEntries += 1;
                        // const issueRecordsArr = myCache.get(inComingRecordKey);
                        await sendPymenTemplate(chatId,
                            dailyTotalAmount,
                            showldBeIssueds,
                            issued,
                            unissueds,
                            numberofEntries,
                            billingStyle,
                            issueRecords,
                            issueofEntries,
                            showldBeIssuedRmb,
                            issuedRmb,
                            unissuedRmb);
                        return;
                    } else {
                        bot.sendMessage(chatId, '请输入正确的金额!');
                    }
                }
                const regexs = /^[-+]?(\d+(\.\d+)?|\.\d+)([-+*\/][-]?(\d+(\.\d+)?|\.\d+))*$/;
                if (messageText.match(regexs)) {
                    if (messageText.match(regexs)) {
                        const amount = parseFloat(messageText.match(regexs)[1]);
                        const price = parseFloat(messageText.match(regexs)[4]);
                        const result = parseFloat('-' + amount * price).toFixed(2);
                        await bot.sendMessage(chatId, result, {
                            reply_to_message_id: messageId
                        });
                        return;
                    }
                    return;
                } else {
                    bot.sendMessage(chatId, '请输入正确的数据格式');
                    return;
                }
            }

            try {
                if (messageText === '删除账单') {
                    const isAdmin = await checkifUserIsAdmin(bot, msg);
                    if (isAdmin) {
                        // 下发账单所有数据重置为0
                        dailyTotalAmount = 0;
                        showldBeIssued = 0;
                        issued = 0;
                        rate = 0;
                        unissued = 0;
                        numberofEntries = 0;
                        issueofEntries = 0;
                        showldBeIssuedRmb = 0;
                        issuedRmb = 0;
                        unissuedRmb = 0;
                        billingStyle = Array.from({ length: 1 }, () => 0);
                        incomingRecords.splice(0);
                        billingStyleZeroRecords.splice(0);
                        issueRecordsArr.splice(0);
                        issueRecords = Array.from({ length: 1 }, () => 0);
                        bot.sendMessage(chatId, '今日账单清理完成', {
                            reply_to_message_id: originalMessageId
                        });
                    } else {
                        bot.sendMessage(chatId, '没有操作权限!');
                    }
                }

            } catch (error) {
                console.error('操作删除账单错误', error);
                throw error;
            }
            if (messageText.startsWith('显示账单') || messageText === '账单') {

                let s = Number(issued);
                if (fixedRate === 0) {
                    const response = await axios.get(apiUrl + Date.now(), {
                        headers: {
                            'User-Agent': ''
                        }
                    });
                    fixedRate = response.data.data.sell[0].price;
                }

                showldBeIssueds = showldBeIssued;
                showldBeIssued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                showldBeIssuedRmb = (dailyTotalAmount / parseFloat(fixedRate) * parseFloat(fixedRate)).toFixed(2);

                //已下发金额 = 入款总金额
                issued = s;

                issuedRmb = (parseFloat(issued * fixedRate)).toFixed(2);

                //未下发金额 = 入款总金额 - 已下发金额
                unissued = (parseFloat(showldBeIssueds - issued)).toFixed(2);

                unissuedRmb = (parseFloat(showldBeIssueds - issued) * fixedRate).toFixed(2);

                numberofEntries += 1;
                billingStyle = await sendRecordsToUser(billingStyleZeroRecords);
                if (billingStyle !== undefined) {
                    console.log('查看格式化样式', billingStyle);
                    await sendPymenTemplate(chatId,
                        dailyTotalAmount,
                        showldBeIssueds,
                        issued,
                        unissued,
                        numberofEntries,
                        billingStyle,
                        issueRecords,
                        issueofEntries,
                        showldBeIssuedRmb,
                        issuedRmb,
                        unissuedRmb);
                } else {
                    await bot.sendMessage(chatId, '暂无账单数据!', {
                        reply_to_message_id: messageId
                    });
                    return;
                }

            }

        } catch (error) {
            console.error('处理入账命令出错', error);
        }
    } catch (error) {
        console.log('处理命令时出现错误', error);
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
                { text: '公群导航', url: 'https://t.me/dbcksq' },
                { text: '完整账单', url: 'https://acbot.top/?id=' + chatId },
            ],
            [
                { text: '使用说明', url: 'https://t.me/jindingjizhang_bot?6' },
                { text: '供求信息', url: 'https://t.me/gongqiu' },
            ],
        ],
    };

    const message = `
    <a href="https://t.me/oydbgq">欧易公群</a>  <a href="https://t.me/oyguanfang">欧易大群</a>
    已入款(${numberofEntries})笔:
     暂无入款

    已下发(${issueofEntries})笔:
    暂无下发

    总入款总金额: ${dailyTotalAmount}
    费率: ${rate}
    实时汇率: ${fixedRate}
    应下发: ${showldBeIssued} (USDT)
    已下发: ${issued} (USDT)
    未下发: ${unissued} (USDT)
`;

    bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
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
    issueofEntries,
    showldBeIssuedRmb,
    issuedRmb,
    unissuedRmb) {
    const keyboard = {
        inline_keyboard: [
            [
                { text: '公群导航', url: 'https://t.me/dbcksq' },
                { text: '完整账单', url: 'https://acbot.top/?id=' + chatId },
            ],
            [
                { text: '使用说明', url: 'https://t.me/jindingjizhang_bot?6' },
                { text: '供求信息', url: 'https://t.me/gongqiu' },
            ],
        ],
    };

    const message = `
    <a href="https://t.me/oydbgq">欧易公群</a>  <a href="https://t.me/oyguanfang">欧易大群</a>
    已入款(${numberofEntries})笔:
    ${billingStyle.join('\n    ')}\n
    已下发(${issueofEntries})笔:
    ${issueRecords.join('\n    ')}
    总入款总金额: ${dailyTotalAmount}
    费率: ${rate}
    实时汇率: ${fixedRate}
    应下发: ${showldBeIssuedRmb} | ${showldBeIssued} (USDT)
    已下发: ${issuedRmb} | ${issued} (USDT)
    未下发: ${unissuedRmb} | ${unissued} (USDT)
`;
    bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
        disable_web_page_preview: true,
    });

}


//如果是 +0模版 则不输出
function sendPymenTemplateAddZero(chatId,
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
                { text: '公群导航', url: 'https://t.me/dbcksq' },
                { text: '完整账单', url: 'https://acbot.top/?id=' + chatId },
            ],
            [
                { text: '使用说明', url: 'https://t.me/jindingjizhang_bot?6' },
                { text: '供求信息', url: 'https://t.me/gongqiu' },
            ],
        ],
    };

    const message = `
    <a href="https://t.me/oydbgq">欧易公群</a>  <a href="https://t.me/oyguanfang">欧易大群</a>
    已入款(${numberofEntries})笔:
    已下发(${issueofEntries})笔:
    总入款总金额: ${dailyTotalAmount}
    费率: ${rate}
    实时汇率: ${fixedRate}
    应下发: ${showldBeIssued} (USDT)
    已下发: ${issued} (USDT)
    未下发: ${unissued} (USDT)
`;

    bot.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
        disable_web_page_preview: true,
    });

}

//处理入款记录的函数
async function handleIncomingRecord(amountReceived, fixedRate) {
    const beijingTime = await getBeijingTime();
    console.log('查看时间格式', beijingTime);
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


//处理入款记录的函数+0
async function handleIncomingRecordAddZero(amountReceived, fixedRate) {
    const beijingTime = await getBeijingTime();
    console.log('查看时间格式', beijingTime);
    const timestamp = Math.floor(beijingTime.toMillis() / 1000);

    const convertedAmount = (amountReceived / fixedRate).toFixed(2);
    const incomingRecord = {
        timestamp: timestamp,
        amountReceived: amountReceived,
        fixedRate: fixedRate,
        convertedAmount: convertedAmount,
    };

    billingStyleZeroRecords.unshift(incomingRecord);
}


//处理下发记录的函数
async function handleIssueRecords(amountReceived, fixedRate) {
    const beijingTime = await getBeijingTime();
    console.log('查看时间格式', beijingTime);
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
    const beijingTime = DateTime.now().setZone('Asia/Shanghai');
    return beijingTime;
}

async function sendRecordsToUser(records) {
    const hasNonZero = records.some(item => item !== 0);
    let recordsArr = [];
    let text = '';
    if (!hasNonZero) {
        return;
    }
    for (const incomingRecord of records) {
        text = await formatRecordText(incomingRecord);
        recordsArr.unshift(text);
    }
    // 如果数组长度超过 3，则删除最旧的数据
    if (recordsArr.length > 3) {
        recordsArr = recordsArr.slice(-3);
    }
    return recordsArr;
}

//发送下发记录
async function issueSendRecordsToUser(records) {
    let issSueArr = [];
    let text = '';
    for (const incomingRecord of records) {
        const formattedRecord = await issueFormatRecordText(incomingRecord);
        text = formattedRecord;
        issSueArr.unshift(text);
    }
    if (issSueArr.length > 3) {
        issSueArr = issSueArr.slice(-3);
    }
    return issSueArr;
}

//处理已下发
async function issueFormatRecordText(records) {
    const options = {
        locale: 'zh-CN',
        hour12: false,
    };
    const timestamp = new Date(records.timestamp * 1000).toLocaleTimeString(
        'zh-CN',
        options
    );
    const foormatRecordText = `${timestamp} ${records.amountReceived} * ${records.fixedRate} = ${records.convertedAmount}(RMB)`;
    return foormatRecordText;

}


async function formatRecordText(records) {
    const options = {
        locale: 'zh-CN',
        hour12: false,
    };
    const timestamp = new Date(records.timestamp * 1000).toLocaleTimeString(
        'zh-CN',
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
    };
}

//清空数组
function clearArray(arr) {
    arr.length = 0;
}

async function getTop10Rates(bot, msg, chatId) {
    const messageText = msg.text;

    if (messageText === 'z0') {
        const isAdmin = await checkifUserIsAdmin(bot, msg);
        if (isAdmin) {
            try {
                const response = await axios.get(apiUrl + Date.now(), {
                    headers: {
                        'User-Agent': ''
                    }
                });
                const data = response.data;

                // 检查数据是否存在
                if (data && data.data) {
                    // 按价格排序并获取前10名
                    const top10Rates = data.data.sell.sort((a, b) => parseFloat(b.last) - parseFloat(a.last)).slice(0, 10);

                    // 生成输出消息
                    let output = '[欧易公群](https://t.me/oydbgq)   [欧易大群](https://t.me/oyguanfang)\n\n*Okex商家实时交易汇率top10*\n';
                    top10Rates.forEach((item, index) => {
                        output += '`' + (index + 1) + ') ' + item.price + '   ' + item.nickName + '\n`';
                    });

                    if (fixedRate === 0) {
                        const response = await axios.get(apiUrl + Date.now(), {
                            headers: {
                                'User-Agent': ''
                            }
                        });
                        fixedRate = response.data.data.sell[0].price;
                    }
                    // 发送结果
                    await bot.sendMessage(chatId, output + `本群费率：${rate}%\n` +
                        `本群汇率：${fixedRate}\n\n`, {
                        parse_mode: 'Markdown',
                        disable_web_page_preview: true
                    });
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

let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const initialRetryDelay = 2000; // 2秒

bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
    reconnectAttempts++;

    if (reconnectAttempts > maxReconnectAttempts) {
        console.error('Maximum reconnect attempts reached, exiting...');
    } else {
        const retryDelay = initialRetryDelay * 2 ** (reconnectAttempts - 1);
        console.log(`Retrying in ${retryDelay} milliseconds...`);
        setTimeout(() => {
            bot.startPolling();
            reconnectAttempts = 0;
        }, retryDelay);
    }
});
