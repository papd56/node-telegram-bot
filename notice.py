import telebot

# 替换为你的 Bot Token  hawkins007bot
BOT_TOKEN = '7907796534:AAE8GKWW98MUoYXKtgCfRVYZyX5mw-sThaM'

bot = telebot.TeleBot(BOT_TOKEN)

@bot.message_handler(commands=['start'])
def send_welcome(message):
    bot.reply_to(message, "Hello! Welcome to my bot.")

bot.polling()