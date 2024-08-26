export default async function checkIfUserIsAdmin(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    // 获取群组信息
    const chat = await bot.getChat(chatId);
    // 判断群组类型
    if (chat.type === 'supergroup') {
      // 超级群组，获取管理员列表
      const members = await bot.getChatAdministrators(chatId);
      return members.some(member => member.user.id === userId);
    } else if (chat.type === 'group') {
      // 普通群组，使用原有的方法
      const chatMember = await bot.getChatMember(chatId, userId);
      return chatMember.status === 'administrator' || chatMember.status === 'creator';
    } else {
      console.error(`不支持的群组类型: ${chat.type}`);
      return false;
    }
  } catch (error) {
    if (error.message.includes('supergroup')) {
      console.error('该群组已经升级为超级群组，请使用超级群组相关的 API');
      const members = await bot.getChatAdministrators(chatId);
      return members.some(member => member.user.id === userId);
    }
  }
}
