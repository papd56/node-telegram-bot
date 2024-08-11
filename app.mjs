import TelegramBot from 'node-telegram-bot-api';
import checkifUserIsAdmin from "./adminCheck.mjs"
import { DateTime } from "luxon";
import axios from 'axios';
const token = "7237081474:AAGsSnjPvvr1RLOgdrQjA9XNl-JrV0bQ-5o";
const bot = new TelegramBot(token, {
    polling: true,
});

const incomingRecords = [];
const outgoingRecords = [];
const issueRecordsArr = [];


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

bot.on("message", async (msg) => {
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
                            unissued = (parseFloat(dailyTotalAmount) - parseFloat(issued)).toFixed(2);

                            unissuedRmb = (parseFloat(dailyTotalAmount - issued) * fixedRate).toFixed(2);

                            numberofEntries += 1;
                            issueofEntries += 1;
                            await handleIssueRecords(amountReceived, fixedRate);
                            issueRecords = await issueSendRecordsToUser(issueRecordsArr);
                            console.log("查看格式化样式", issueRecordsArr);
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
                if (messageText === "+0") {
                    const keyboard = {
                        inline_keyboard: [
                            [
                                { text: "公群导航", url: "https://t.me/dbcksq" },
                                { text: "供求信息", url: "https://t.me/s/TelePlanting" },
                                { text: "点击跳转完整账单", url: "https://a.jzbot.top/?id=" + chatId },
                            ],
                        ],
                    };
                    await deleteBillTemplate(chatId,
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
                if (messageText.startsWith("+")) {
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
                                console.log("官网实时固定汇率：>>>>>>>>>>>>>>>>" +  fixedRate)
                            }

                            dailyTotalAmount = (parseFloat(s) + Number(dailyTotalAmount)).toFixed(2);

                            showldBeIssued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                            showldBeIssuedRmb = (dailyTotalAmount / parseFloat(fixedRate) * parseFloat(fixedRate)).toFixed(2);

                            //已下发金额 = 入款总金额
                            issued = (parseFloat(issued + dailyTotalAmount)).toFixed(2);

                            issuedRmb = (parseFloat(issued + dailyTotalAmount) * fixedRate).toFixed(2);

                            //未下发金额 = 入款总金额 - 已下发金额
                            unissued = (parseFloat(dailyTotalAmount) - parseFloat(issued)).toFixed(2);

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

                        } else {
                            bot.sendMessage(chatId, "请先设置汇率!")
                        }
                    }
                }

                //如果机器人接收到的指令是 - 做减法
                if (messageText.startsWith("-")) {
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
                            }

                            dailyTotalAmount = (parseFloat(s) + Number(dailyTotalAmount)).toFixed(2);

                            showldBeIssued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                            showldBeIssuedRmb = (dailyTotalAmount / parseFloat(fixedRate) * parseFloat(fixedRate)).toFixed(2);

                            //已下发金额 = 入款总金额
                            issued = (parseFloat(issued + dailyTotalAmount)).toFixed(2);

                            issuedRmb = (parseFloat(issued + dailyTotalAmount) * fixedRate).toFixed(2);

                            //未下发金额 = 入款总金额 - 已下发金额
                            unissued = (parseFloat(dailyTotalAmount) - parseFloat(issued)).toFixed(2);

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
                                billingStyle);

                        } else {
                            bot.sendMessage(chatId, "请先设置汇率!")
                        }
                    }
                }

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
                            unissued = (parseFloat(dailyTotalAmount) - parseFloat(issued)).toFixed(2);

                            unissuedRmb = (parseFloat(unissued * fixedRate)).toFixed(2);

                            numberofEntries += 1;
                            billingStyle = await sendRecordsToUser(incomingRecords);
                            console.log("查看格式化样式", billingStyle);
                            await deleteBillTemplate(chatId,
                                0,
                                0,
                                0,
                                0,
                                0,
                                0,
                                0,
                                0,
                                0);
                            bot.sendMessage(chatId, "今日账单清理完成", {
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


                if (messageText.startsWith("显示账单")) {

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
                    unissued = (parseFloat(dailyTotalAmount) - parseFloat(issued)).toFixed(2);

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

//删除账单模版
function deleteBillTemplate(chatId,
    dailyTotalAmount,
    showldBeIssued,
    issued,
    unissued,
    numberofEntries,
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
                { text: "点击跳转完整账单", url: "https://a.jzbot.top/?id=" + chatId },
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


//删除聊天机器人
async function deleteChatBot() {
    const options = {
        chat: chat,
        boostId: boost_id,
        remove_date: remove_date,
        source: source
    }
}
