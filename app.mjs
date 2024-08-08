import TelegramBot from 'node-telegram-bot-api';
import checkifUserIsAdmin from "./adminCheck.mjs"
import { DateTime } from "luxon";
const token = "7237081474:AAGs7NVdQkM4FAIad3OPJ-mqTyxAgAIrfsc";
const bot = new TelegramBot(token, {
    polling: true,
});

const incomingRecords = [];
const outgoingRecords = [];

let billingStyle = [];
let outIssyedStyle = [];


let fixedRate = 0.00; //全局变量汇率
let rate = 0.00; //全局变量汇率

let dailyTotalAmount = 0; //入款总金额
let numberofEntries = 0; //入账笔数
let showldBeIssued = 0; //应下发金额
let showldBeIssuedRmb = 0; //应下发金额rmb
let issued = 0; //已下发金额
let issuedRmb = 0; //已下发金额rmb
let unissued = 0; //未下发金额
let unissuedRmb = 0; //未下发金额Rmb

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const messageText = msg.text;

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

                            showldBeIssued = (dailyTotalAmount / parseFloat(fixedRate)).toFixed(2);

                            showldBeIssuedRmb = (dailyTotalAmount * parseFloat(fixedRate)).toFixed(2);

                            //已下发金额 = 入款总金额
                            issued = (parseFloat(issued + dailyTotalAmount)).toFixed(2);

                            //未下发金额 = 入款总金额 - 已下发金额
                            unissued = (parseFloat(dailyTotalAmount) - parseFloat(issued)).toFixed(2);

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
            } catch (error) {
                console.error("处理入账命令出错", error);
            }
        }
    } catch (error) {
        console.log("处理命令时出现错误", error);
        throw error;
    }
});

//设置回复模版
function sendPymenTemplate(chatId,
    dailyTotalAmount,
    showldBeIssued,
    issued,
    unissued,
    numberofEntries,
    billingStyle) {
    const keyboard = {
        inline_keyboard: [
            [
                { text: "公群导航", url: "https://t.me/dbcksq" },
                { text: "供求信息", url: "https://t.me/s/TelePlanting" },
            ],
        ],
    };

    const message = `<a href = "https://t.me/@Guik88">518</a>
    <b>已入款(${numberofEntries}笔: )</b>
    ${billingStyle} 
    <b>入款总金额：</b>${dailyTotalAmount}
    <b>费率：</b>${rate}
    <b>固定汇率：</b>${fixedRate}
    <b>应下发：</b>${showldBeIssued}(USDT)${showldBeIssuedRmb}(RMB)
    <b>已下发：</b>${issued}(USDT)
    <b>未下发：</b>${unissued}(USDT)`;

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

async function getBeijingTime() {
    const beijingTime = DateTime.now().setZone("Asia/Shanghai");
    return beijingTime;
}

async function sendRecordsToUser(records) {
    let text = "";
    for (const incomingRecord of records) {
        const formattedRecord = await formatRecordText(incomingRecord);
        text = formattedRecord; + "\n" + text;
    }
    return text;
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