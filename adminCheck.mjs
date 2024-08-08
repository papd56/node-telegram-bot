import TelegramBot from 'node-telegram-bot-api';
const token = "7237081474:AAGs7NVdQkM4FAIad3OPJ-mqTyxAgAIrfsc";

const bot = new TelegramBot(token);

export default async function checkifUserIsAdmin(msg) {
    const chat_id = msg.chat.id;
    const user_id = msg.from.id;
    try {
        const ChatMember = await bot.getChatMember(chat_id, user_id);
        if (
            ChatMember.status === "administrator" ||
            ChatMember.status === "creator"
        ) {
            return 1;
        } else {
            return 0;
        }
    } catch (error) {
        console.error("获取成员信息出错：", error)
        throw error;
    }
}