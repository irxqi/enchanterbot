const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');
const startServer = require('./keep_alive.js');
require('dotenv').config(); // Load environment variables

// Load configuration
const { token, clientId, rankRoles, RESULTS_CHANNEL_ID } = require('./config.json');
const words = require('./words.json');

// Initialize stats
const statsPath = path.join(__dirname, 'stats.json');
let stats = {};
if (fs.existsSync(statsPath)) {
    stats = JSON.parse(fs.readFileSync(statsPath));
}

// Font setup
try {
    registerFont(path.join(__dirname, 'fonts', 'Minecraft.ttf'), { family: 'Minecraft' });
    registerFont(path.join(__dirname, 'fonts', 'MinecraftBold.ttf'), { family: 'Minecraft', weight: 'bold' });
} catch (err) {
    console.error('Error loading fonts:', err);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Translation mappings
const ENCHANTING_TO_ENGLISH = {
    'ᔑ': 'A', 'ʖ': 'B', 'ᓵ': 'C', '↸': 'D', 'ᒷ': 'E', '⎓': 'F', '⊣': 'G', '⍑': 'H',
    '╎': 'I', '⋮': 'J', 'ꖌ': 'K', 'ꖎ': 'L', 'ᒲ': 'M', 'リ': 'N', '𝙹': 'O', '!¡': 'P',
    'ᑑ': 'Q', '∷': 'R', 'ᓭ': 'S', 'ℸ': 'T', '̣': '', '⚍': 'U', '⍊': 'V', '∴': 'W',
    '̇/': 'X', '||': 'Y', '⨅': 'Z'
};

const ENGLISH_TO_ENCHANTING = {
    'A': 'ᔑ', 'B': 'ʖ', 'C': 'ᓵ', 'D': '↸', 'E': 'ᒷ', 'F': '⎓', 'G': '⊣', 'H': '⍑',
    'I': '╎', 'J': '⋮', 'K': 'ꖌ', 'L': 'ꖎ', 'M': 'ᒲ', 'N': 'リ', 'O': '𝙹', 'P': '!¡',
    'Q': 'ᑑ', 'R': '∷', 'S': 'ᓭ', 'T': 'ℸ', 'U': '⚍', 'V': '⍊', 'W': '∴', 'X': '̇/',
    'Y': '||', 'Z': '⨅'
};

const activeGames = new Map();
const duelChallenges = new Map();
const cooldowns = new Map();

// Helper functions
function translateToEnchanting(text) {
    return text.toUpperCase().split('').map(char => ENGLISH_TO_ENCHANTING[char] || char).join(' ');
}

function translateToEnglish(text) {
    let result = [];
    let i = 0;
    
    while (i < text.length) {
        if (i + 1 < text.length) {
            const twoChar = text[i] + text[i + 1];
            if (ENCHANTING_TO_ENGLISH[twoChar]) {
                result.push(ENCHANTING_TO_ENGLISH[twoChar]);
                i += 2;
                continue;
            }
        }
        
        const char = text[i];
        result.push(ENCHANTING_TO_ENGLISH[char] || char);
        i++;
    }
    
    return result.join('');
}

function createGameOptions(options, guessedSymbols = []) {
    const rows = [];
    let currentRow = new ActionRowBuilder();
    
    options.forEach((symbol) => {
        const button = new ButtonBuilder()
            .setCustomId(`guess_${symbol}`)
            .setLabel(symbol)
            .setStyle(guessedSymbols.includes(symbol) ? ButtonStyle.Secondary : ButtonStyle.Primary)
            .setDisabled(guessedSymbols.includes(symbol));
        
        if (currentRow.components.length < 5) {
            currentRow.addComponents(button);
        } else {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder();
            currentRow.addComponents(button);
        }
    });
    
    if (currentRow.components.length > 0) {
        rows.push(currentRow);
    }
    
    return rows;
}

function getRank(points) {
    points = Math.floor(points);
    if (points >= 3000) return { name: 'Master', tier: '', color: '#DC143C' };
    if (points >= 2700) return { name: 'Diamond', tier: 'V', color: '#4EE2EC' };
    if (points >= 2400) return { name: 'Diamond', tier: 'IV', color: '#4EE2EC' };
    if (points >= 2100) return { name: 'Diamond', tier: 'III', color: '#4EE2EC' };
    if (points >= 1800) return { name: 'Diamond', tier: 'II', color: '#4EE2EC' };
    if (points >= 1500) return { name: 'Diamond', tier: 'I', color: '#4EE2EC' };
    if (points >= 1320) return { name: 'Gold', tier: 'V', color: '#FFD700' };
    if (points >= 1140) return { name: 'Gold', tier: 'IV', color: '#FFD700' };
    if (points >= 960) return { name: 'Gold', tier: 'III', color: '#FFD700' };
    if (points >= 780) return { name: 'Gold', tier: 'II', color: '#FFD700' };
    if (points >= 600) return { name: 'Gold', tier: 'I', color: '#FFD700' };
    if (points >= 480) return { name: 'Iron', tier: 'V', color: '#C0C0C0' };
    if (points >= 360) return { name: 'Iron', tier: 'IV', color: '#C0C0C0' };
    if (points >= 240) return { name: 'Iron', tier: 'III', color: '#C0C0C0' };
    if (points >= 120) return { name: 'Iron', tier: 'II', color: '#C0C0C0' };
    return { name: 'Iron', tier: 'I', color: '#C0C0C0' };
}

function getPointsForTry(triesUsed, gameTime, isDuel = false, playerPoints = 0, opponentPoints = 0) {
    let points = {1: 12, 2: 8, 3: 5}[triesUsed] || 0;
    
    if (gameTime <= 10) points = Math.floor(points * 1.5);
    else if (gameTime <= 20) points = Math.floor(points * 1.25);
    
    if (isDuel) {
        const pointDifference = playerPoints - opponentPoints;
        if (pointDifference > 0) {
            points = Math.max(1, Math.floor(points * (1 - Math.min(0.5, pointDifference / 1000))));
        } else if (pointDifference < 0) {
            points = Math.floor(points * (1 + Math.min(1, Math.abs(pointDifference) / 500)));
        }
    }
    
    return points;
}

async function updateRankRole(member, newRank) {
    if (!member) return;

    try {
        for (const rankType in rankRoles) {
            if (typeof rankRoles[rankType] === 'object') {
                for (const tier in rankRoles[rankType]) {
                    const roleId = rankRoles[rankType][tier];
                    if (member.roles.cache.has(roleId)) {
                        await member.roles.remove(roleId).catch(console.error);
                    }
                }
            } else {
                const roleId = rankRoles[rankType];
                if (member.roles.cache.has(roleId)) {
                    await member.roles.remove(roleId).catch(console.error);
                }
            }
        }
        
        if (newRank.name.toLowerCase() === 'master') {
            const roleId = rankRoles.master;
            if (roleId) await member.roles.add(roleId).catch(console.error);
        } else {
            const roleId = rankRoles[newRank.name.toLowerCase()]?.[newRank.tier];
            if (roleId) await member.roles.add(roleId).catch(console.error);
        }
    } catch (error) {
        console.error('Error updating roles:', error);
    }
}

function updateStats(userId, username, displayName, points = 0, won = false) {
    if (!stats[userId]) {
        stats[userId] = { 
            points: 0,
            gamesPlayed: 0,
            gamesWon: 0,
            username: username,
            displayName: displayName
        };
    }
    
    stats[userId].points += points;
    stats[userId].gamesPlayed += 1;
    if (won) stats[userId].gamesWon += 1;
    stats[userId].username = username;
    stats[userId].displayName = displayName;
    
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
}

async function generateLeaderboardImage() {
    const sortedStats = Object.entries(stats)
        .sort((a, b) => b[1].points - a[1].points)
        .slice(0, 10);
    
    const canvas = createCanvas(800, 500);
    const ctx = canvas.getContext('2d');
    
    // Background and text setup
    ctx.fillStyle = '#1E1E1E';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#57F287';
    ctx.font = 'bold 36px Minecraft';
    ctx.textAlign = 'center';
    ctx.fillText('ENCHANTING LEADERBOARD', canvas.width/2, 50);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 22px Minecraft';
    ctx.fillText('TOP PLAYERS', canvas.width/2, 80);
    
    ctx.fillStyle = '#2C2F33';
    ctx.roundRect(30, 90, canvas.width-60, canvas.height-130, 15);
    ctx.fill();
    
    // Player entries
    const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
    const avatarSize = 30;
    const textStartX = 140;
    const pointsX = 600;
    const winsX = 700;
    
    // Column headers
    ctx.fillStyle = '#5788f2';
    ctx.font = 'bold 16px Minecraft';
    ctx.textAlign = 'right';
    ctx.fillText('Points', pointsX, 95);
    ctx.fillText('W/L', winsX, 95);
    
    for (const [index, [userId, data]] of sortedStats.entries()) {
        const y = 110 + index * 40;
        const rank = getRank(data.points);
        const rankText = `${rank.name} ${rank.tier}`.trim();
        
        try {
            const user = await client.users.fetch(userId).catch(() => null);
            if (user) {
                const avatar = await loadImage(user.displayAvatarURL({ extension: 'png', size: 256 }));
                ctx.save();
                ctx.beginPath();
                ctx.arc(110, y + avatarSize/2, avatarSize/2, 0, Math.PI * 2, true);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(avatar, 110 - avatarSize/2, y, avatarSize, avatarSize);
                ctx.restore();
            }
        } catch (error) {
            console.error('Error loading avatar:', error);
        }
        
        // Rank number
        ctx.fillStyle = index < 3 ? medalColors[index] : '#FFFFFF';
        ctx.font = 'bold 18px Minecraft';
        ctx.textAlign = 'center';
        ctx.fillText(index < 3 ? ['1.', '2.', '3.'][index] : `${index + 1}.`, 80, y + 20);
        
        // Player name with rank in parentheses
        const displayName = data.displayName || `User ${userId.slice(0, 6)}`;
        const nameWithRank = `${displayName} (${rankText})`;
        
        // Truncate if too long
        const maxWidth = pointsX - textStartX - 20;
        let displayText = nameWithRank;
        if (ctx.measureText(nameWithRank).width > maxWidth) {
            // Shorten the name while keeping the rank
            const rankPart = ` (${rankText})`;
            let namePart = displayName;
            while (ctx.measureText(namePart + rankPart).width > maxWidth && namePart.length > 1) {
                namePart = namePart.slice(0, -1);
            }
            displayText = namePart + '...' + rankPart;
        }
        
        ctx.fillStyle = rank.color || '#FFFFFF';
        ctx.font = '18px Minecraft';
        ctx.textAlign = 'left';
        ctx.fillText(displayText, textStartX, y + 20);
        
        // Points (green)
        ctx.fillStyle = '#57F287';
        ctx.font = '16px Minecraft';
        ctx.textAlign = 'right';
        ctx.fillText(`${data.points}`, pointsX, y + 20);
        
        // W/L with colored numbers
        const wins = data.gamesWon || 0;
        const losses = (data.gamesPlayed || 0) - wins;
        
        // Calculate positions
        const slashWidth = ctx.measureText('/').width;
        const winsWidth = ctx.measureText(wins).width;
        const lossesWidth = ctx.measureText(losses).width;
        
        // Draw from right to left
        let xPos = winsX;
        
        // Losses (red)
        ctx.fillStyle = '#ED4245';
        ctx.fillText(losses.toString(), xPos, y + 20);
        xPos -= lossesWidth;
        
        // Slash (gray)
        ctx.fillStyle = '#B9BBBE';
        ctx.fillText('/', xPos, y + 20);
        xPos -= slashWidth;
        
        // Wins (green)
        ctx.fillStyle = '#57F287';
        ctx.fillText(wins.toString(), xPos, y + 20);
    }
    
    // Footer
    ctx.fillStyle = '#72767D';
    ctx.font = '14px Minecraft';
    ctx.textAlign = 'center';
    ctx.fillText(`Last updated: ${new Date().toLocaleString()}`, canvas.width/2, canvas.height-20);
    
    return canvas.toBuffer();
}
// Slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('enchant')
        .setDescription('Translate English to enchanting table language')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('Text to translate')
                .setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('unenchant')
        .setDescription('Translate enchanting table language to English')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('Enchanting symbols to translate')
                .setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('game')
        .setDescription('Play a game to test your knowledge of enchanting table language'),
        
    new SlashCommandBuilder()
        .setName('cancelgame')
        .setDescription('Cancel your current enchanting table game'),
    
    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Check enchanting game stats')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to check stats for')
                .setRequired(false)),
    
    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Show the top players'),
        
    new SlashCommandBuilder()
        .setName('duel')
        .setDescription('Challenge someone to a 1v1 enchanting game')
        .addUserOption(option =>
            option.setName('opponent')
                .setDescription('Who you want to challenge')
                .setRequired(true))
].map(command => command.toJSON());

// Register commands
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Refreshing slash commands...');
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log('Slash commands registered!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
})();

// Bot events
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    client.user.setActivity('Enchanting Table', { type: 'PLAYING' });
});

async function safeReply(interaction, content, ephemeral = true) {
    try {
        if (interaction.replied || interaction.deferred) {
            return await interaction.followUp({ content, ephemeral });
        }
        return await interaction.reply({ content, ephemeral });
    } catch (error) {
        console.error('Failed to reply:', error);
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

    // Cooldown check
    if (cooldowns.has(interaction.user.id)) {
        return safeReply(interaction, 'Please wait a moment before using commands again.');
    }
    cooldowns.set(interaction.user.id, true);
    setTimeout(() => cooldowns.delete(interaction.user.id), 2000);

    try {
        if (interaction.isChatInputCommand()) {
            if (['enchant', 'unenchant'].includes(interaction.commandName)) {
                if (activeGames.has(interaction.user.id)) {
                    return safeReply(interaction, '❌ You cannot use translation commands while playing a game!');
                }
            }

            if (interaction.commandName === 'enchant') {
                const text = interaction.options.getString('text');
                await safeReply(interaction, `**Translation:** ${translateToEnchanting(text)}`, false);
            }
            else if (interaction.commandName === 'unenchant') {
                const text = interaction.options.getString('text');
                await safeReply(interaction, `**Translation:** ${translateToEnglish(text)}`, false);
            }
            else if (interaction.commandName === 'game') {
                if (activeGames.has(interaction.user.id)) {
                    return safeReply(interaction, '❌ You already have an active game!');
                }

                updateStats(interaction.user.id, interaction.user.username, interaction.user.displayName);

                const selectedWords = [...words].sort(() => 0.5 - Math.random()).slice(0, 18);
                const target = selectedWords[Math.floor(Math.random() * selectedWords.length)];
                const targetSymbol = translateToEnchanting(target);
                
                const gameState = {
                    target,
                    targetSymbol,
                    options: selectedWords.map(word => translateToEnchanting(word)),
                    guessedSymbols: [],
                    triesLeft: 3,
                    channelId: interaction.channelId,
                    startTime: Date.now(),
                    isDuel: false
                };
                
                activeGames.set(interaction.user.id, gameState);
                
                const embed = new EmbedBuilder()
                    .setTitle('Enchanting Table Game')
                    .setDescription(`Find the symbol that means **${target}**`)
                    .setColor(0x5865F2)
                    .setFooter({ text: 'You have 3 tries - good luck!' });
                
                await interaction.reply({ 
                    embeds: [embed], 
                    components: createGameOptions(gameState.options),
                    ephemeral: true 
                });
            }
            else if (interaction.commandName === 'duel') {
                const opponent = interaction.options.getUser('opponent');
                
                if (opponent.bot) {
                    return safeReply(interaction, "❌ You can't challenge a bot!");
                }
                
                if (opponent.id === interaction.user.id) {
                    return safeReply(interaction, "❌ You can't challenge yourself!");
                }
                
                if (activeGames.has(interaction.user.id) || activeGames.has(opponent.id)) {
                    return safeReply(interaction, "❌ One of you already has an active game!");
                }
                
                duelChallenges.set(interaction.user.id, {
                    challenger: interaction.user,
                    opponent: opponent,
                    channelId: interaction.channelId,
                    timestamp: Date.now(),
                    resultsChannelId: RESULTS_CHANNEL_ID
                });
                
                const challengeEmbed = new EmbedBuilder()
                    .setTitle('⚔️ Enchanting Duel Challenge!')
                    .setDescription(`${interaction.user.toString()} has challenged you to a duel!\n\nFirst to find the correct symbol wins!`)
                    .setColor(0xF1C40F)
                    .setFooter({ text: 'You have 60 seconds to accept' });
                
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`duel_accept_${interaction.user.id}`)
                            .setLabel('Accept Challenge')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId(`duel_decline_${interaction.user.id}`)
                            .setLabel('Decline')
                            .setStyle(ButtonStyle.Danger)
                    );
                
                try {
                    await opponent.send({
                        content: `You've been challenged to a duel by ${interaction.user.toString()}!`,
                        embeds: [challengeEmbed],
                        components: [row]
                    });
                    
                    await safeReply(interaction, `Duel challenge sent to ${opponent.toString()}! They've been notified via DM.`);
                    
                    setTimeout(async () => {
                        if (duelChallenges.has(interaction.user.id)) {
                            duelChallenges.delete(interaction.user.id);
                            try {
                                await opponent.send({
                                    content: `The duel challenge from ${interaction.user.toString()} has expired.`,
                                    embeds: [],
                                    components: []
                                });
                            } catch (error) {
                                console.error('Failed to send expiration notice:', error);
                            }
                        }
                    }, 60000);
                } catch (error) {
                    console.error('Failed to send duel challenge:', error);
                    await safeReply(interaction, "❌ Couldn't send the duel challenge. The user might have DMs disabled.");
                    duelChallenges.delete(interaction.user.id);
                }
            }
            else if (interaction.commandName === 'cancelgame') {
                if (activeGames.has(interaction.user.id)) {
                    const game = activeGames.get(interaction.user.id);
                    if (game.isDuel) {
                        const opponentId = game.opponentId;
                        if (activeGames.has(opponentId)) {
                            activeGames.delete(opponentId);
                            const opponent = await client.users.fetch(opponentId).catch(() => null);
                            if (opponent) {
                                opponent.send({
                                    content: `❌ ${interaction.user.toString()} canceled the duel.`
                                }).catch(console.error);
                            }
                        }
                    }
                    
                    activeGames.delete(interaction.user.id);
                    await safeReply(interaction, 'Game canceled!');
                } else {
                    await safeReply(interaction, "❌ You don't have an active game.");
                }
            }
            else if (interaction.commandName === 'stats') {
                const userOption = interaction.options.getUser('user');
                const targetUser = userOption || interaction.user;
                const userId = targetUser.id;
                
                const userStats = stats[userId] || { 
                    points: 0, 
                    gamesPlayed: 0, 
                    gamesWon: 0,
                };
                
                const gamesLost = userStats.gamesPlayed - userStats.gamesWon;
                const rank = getRank(userStats.points);
                const rankText = `${rank.name} ${rank.tier}`.trim();
                
                const embed = new EmbedBuilder()
                    .setTitle(`${targetUser.displayName}'s Stats`)
                    .setColor(rank.color || 0x5865F2)
                    .setThumbnail(targetUser.displayAvatarURL())
                    .addFields(
                        { name: 'Total Points', value: `${userStats.points}`, inline: true },
                        { name: 'Rank', value: rankText, inline: true },
                        { name: 'Games Played', value: `${userStats.gamesPlayed}`, inline: true },
                        { name: 'Games Won', value: `${userStats.gamesWon}`, inline: true },
                        { name: 'Games Lost', value: `${gamesLost}`, inline: true },
                        { name: 'Win Rate', value: userStats.gamesPlayed > 0 
                            ? `${Math.round((userStats.gamesWon / userStats.gamesPlayed) * 100)}%` 
                            : '0%', 
                          inline: true }
                    );
                
                await interaction.reply({ embeds: [embed] });
            }
            else if (interaction.commandName === 'leaderboard') {
                await interaction.deferReply();
                
                try {
                    const imageBuffer = await generateLeaderboardImage();
                    await interaction.editReply({
                        files: [{
                            attachment: imageBuffer,
                            name: 'leaderboard.png'
                        }],
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('Enchanting Leaderboard')
                                .setColor(0xF1C40F)
                                .setImage('attachment://leaderboard.png')
                        ]
                    });
                } catch (error) {
                    console.error('Error generating leaderboard:', error);
                    await interaction.editReply({
                        content: 'There was an error generating the leaderboard.'
                    });
                }
            }
        }
        else if (interaction.isButton()) {
            if (interaction.customId.startsWith('duel_')) {
                const parts = interaction.customId.split('_');
                const action = parts[1];
                const challengerId = parts[2];
                
                if (!duelChallenges.has(challengerId)) {
                    return interaction.update({
                        content: 'Challenge expired or canceled.',
                        embeds: [],
                        components: []
                    }).catch(() => {});
                }
                
                const challenge = duelChallenges.get(challengerId);
                
                if (interaction.user.id !== challenge.opponent.id) {
                    return safeReply(interaction, 'This challenge is not for you!');
                }
                
                if (action === 'accept') {
                    duelChallenges.delete(challengerId);
                    
                    const resultsChannel = await client.channels.fetch(RESULTS_CHANNEL_ID).catch(console.error);
                    
                    async function sendCountdown(user) {
                        const countdownEmbed = new EmbedBuilder()
                            .setTitle('⚔️ Duel Starting!')
                            .setDescription('Get ready... the duel begins in:')
                            .setColor(0xF1C40F);
                        
                        const msg = await user.send({ embeds: [countdownEmbed] }).catch(console.error);
                        
                        for (let i = 3; i > 0; i--) {
                            countdownEmbed.setDescription(`Get ready... the duel begins in: **${i}**`);
                            if (msg) await msg.edit({ embeds: [countdownEmbed] }).catch(console.error);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                        
                        countdownEmbed.setDescription('**GO!** Find the correct symbol first!');
                        if (msg) await msg.edit({ embeds: [countdownEmbed] }).catch(console.error);
                        return msg;
                    }
                    
                    await Promise.all([
                        sendCountdown(challenge.challenger),
                        sendCountdown(challenge.opponent)
                    ]);
                    
                    const selectedWords = [...words].sort(() => 0.5 - Math.random()).slice(0, 18);
                    const target = selectedWords[Math.floor(Math.random() * selectedWords.length)];
                    const targetSymbol = translateToEnchanting(target);
                    
                    const challengerGame = {
                        target,
                        targetSymbol,
                        options: selectedWords.map(word => translateToEnchanting(word)),
                        guessedSymbols: [],
                        triesLeft: 3,
                        channelId: challenge.channelId,
                        startTime: Date.now(),
                        isDuel: true,
                        opponentId: challenge.opponent.id,
                        resultsChannelId: RESULTS_CHANNEL_ID
                    };
                    
                    const opponentGame = {
                        target,
                        targetSymbol,
                        options: selectedWords.map(word => translateToEnchanting(word)),
                        guessedSymbols: [],
                        triesLeft: 3,
                        channelId: challenge.channelId,
                        startTime: Date.now(),
                        isDuel: true,
                        opponentId: challenge.challenger.id,
                        resultsChannelId: RESULTS_CHANNEL_ID
                    };
                    
                    activeGames.set(challenge.challenger.id, challengerGame);
                    activeGames.set(challenge.opponent.id, opponentGame);
                    
                    const duelEmbed = new EmbedBuilder()
                        .setTitle('⚔️ Enchanting Duel Started!')
                        .setDescription(`Find the symbol that means **${target}**`)
                        .setColor(0xF1C40F)
                        .setFooter({ text: 'First to find the correct symbol wins!' });
                    
                    challenge.challenger.send({
                        embeds: [duelEmbed],
                        components: createGameOptions(challengerGame.options)
                    }).catch(console.error);
                    
                    challenge.opponent.send({
                        embeds: [duelEmbed],
                        components: createGameOptions(opponentGame.options)
                    }).catch(console.error);
                    
                    await interaction.update({
                        content: `Duel accepted! Check your DMs to play!`,
                        embeds: [],
                        components: []
                    }).catch(() => {});
                    

                } 
                else if (action === 'decline') {
                    duelChallenges.delete(challengerId);
                    await interaction.update({
                        content: `${interaction.user.toString()} declined the challenge.`,
                        embeds: [],
                        components: []
                    }).catch(() => {});
                    
                    try {
                        await challenge.challenger.send({
                            content: `${interaction.user.toString()} declined your duel challenge.`
                        });
                    } catch (error) {
                        console.error('Failed to notify challenger:', error);
                    }
                }
            }
            else if (interaction.customId.startsWith('guess_')) {
                const userId = interaction.user.id;
                if (!activeGames.has(userId)) {
                    return interaction.reply({
                        content: 'This game session has expired.',
                        ephemeral: true
                    }).catch(() => {});
                }
                
                const game = activeGames.get(userId);
                const symbol = interaction.customId.split('_')[1];
                const guessedWord = words.find(word => translateToEnchanting(word) === symbol);
                
                game.guessedSymbols.push(symbol);
                
                if (symbol === game.targetSymbol) {
                    const gameTimeSeconds = (Date.now() - game.startTime) / 1000;
                    const triesUsed = 3 - game.triesLeft + 1;
                    
                    let pointsEarned;
                    let opponentPointsLost = 0;
                    
                    if (game.isDuel) {
                        const opponentStats = stats[game.opponentId] || { points: 0 };
                        const playerStats = stats[userId] || { points: 0 };
                        pointsEarned = getPointsForTry(triesUsed, gameTimeSeconds, true, playerStats.points, opponentStats.points);
                        opponentPointsLost = Math.floor(pointsEarned * 0.75);
                        
                        if (activeGames.has(game.opponentId)) {
                            activeGames.delete(game.opponentId);
                            const opponent = await client.users.fetch(game.opponentId).catch(() => null);
                            if (opponent) {
                                updateStats(game.opponentId, opponent.username, opponent.displayName, -opponentPointsLost, false);
                                
                                try {
                                    const member = await interaction.guild?.members.fetch(game.opponentId).catch(() => null);
                                    if (member) {
                                        const userStats = stats[game.opponentId] || { points: 0 };
                                        const rank = getRank(userStats.points);
                                        await updateRankRole(member, rank);
                                    }
                                } catch (error) {
                                    console.error('Error updating rank role:', error);
                                }
                                
                                opponent.send({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setTitle('💀 Duel Lost')
                                            .setDescription(`You lost the duel against ${interaction.user.toString()}!`)
                                            .setColor(0xED4245)
                                            .addFields(
                                                { name: 'Correct Answer', value: `${game.targetSymbol} = ${game.target}`, inline: false },
                                                { name: 'Points Lost', value: `${opponentPointsLost}`, inline: true }
                                            )
                                    ]
                                }).catch(console.error);
                            }
                        }
                        
                        const resultsChannel = await client.channels.fetch(game.resultsChannelId).catch(console.error);
                        if (resultsChannel) {
                            resultsChannel.send({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle('<:ediasword:1356674103188263132> Duel Results')
                                        .setDescription(`${interaction.user.toString()} won against ${game.opponentId ? `<@${game.opponentId}>` : 'opponent'}!`)
                                        .setColor(0x57F287)
                                        .addFields(
                                            { 
                                                name: 'Winner & Points Gained', 
                                                value: `<:trophy:1356670866556981471> ${interaction.user.toString()} <:Up:1356670011867009182>${pointsEarned}`, 
                                                inline: true 
                                            },
                                            { 
                                                name: 'Loser & Points Lost', 
                                                value: `<:skull:1356671211110793236> ${game.opponentId ? `<@${game.opponentId}>` : 'opponent'} <:Down:1356669989536399542>${opponentPointsLost}`, 
                                                inline: true 
                                            },
                                            { 
                                                name: '\u200b', 
                                                value: '\u200b', 
                                                inline: true 
                                            },
                                            { 
                                                name: 'Word & Time', 
                                                value: `<:bannerpattern:1356675784709898441> ${game.target}   <:clock:1356675039650385960> ${gameTimeSeconds.toFixed(1)}s`, 
                                                inline: false 
                                            }
                                        )
                                        .setThumbnail(client.user.displayAvatarURL())
                                ]
                            }).catch(console.error);
                        }
                    } else {
                        pointsEarned = getPointsForTry(triesUsed, gameTimeSeconds);
                    }
                    
                    updateStats(userId, interaction.user.username, interaction.user.displayName, pointsEarned, true);
                    
                    try {
                        const member = await interaction.guild?.members.fetch(userId).catch(() => null);
                        if (member) {
                            const userStats = stats[userId] || { points: 0 };
                            const rank = getRank(userStats.points);
                            await updateRankRole(member, rank);
                        }
                    } catch (error) {
                        console.error('Error updating rank role:', error);
                    }
                    
                    activeGames.delete(userId);
                    
                    const embed = new EmbedBuilder()
                        .setTitle(game.isDuel ? '🎉 You won the duel!' : '🎉 Correct!')
                        .setDescription(`You found the symbol for **${game.target}**!`)
                        .setColor(0x57F287)
                        .setThumbnail(interaction.user.displayAvatarURL())
                        .addFields(
                            { name: 'Symbol', value: symbol, inline: true },
                            { name: 'Points Earned', value: `${pointsEarned}`, inline: true },
                            { name: 'Time', value: `${gameTimeSeconds.toFixed(1)}s`, inline: true },
                            { name: 'Total Points', value: `${stats[userId]?.points || 0}`, inline: false },
                            { name: 'Rank', value: `${getRank(stats[userId]?.points || 0).name} ${getRank(stats[userId]?.points || 0).tier}`.trim(), inline: false }
                        );
                    
                    await interaction.update({
                        embeds: [embed],
                        components: []
                    }).catch(() => {});
                } 
                else {
                    game.triesLeft--;
                    
                    if (game.triesLeft > 0) {
                        await interaction.update({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle(game.isDuel ? '⚔️ Enchanting Duel' : 'Enchanting Table Game')
                                    .setDescription(`Find the symbol that means **${game.target}**`)
                                    .setColor(0x5865F2)
                                    .addFields(
                                        { name: 'Incorrect', value: `❌ ${symbol} means **${guessedWord}**` },
                                        { name: 'Tries Left', value: `${game.triesLeft}`, inline: true },
                                        { name: 'Guessed Symbols', value: game.guessedSymbols.map(s => `${s} = ${words.find(w => translateToEnchanting(w) === s)}`).join('\n') || 'None', inline: false }
                                    )
                            ],
                            components: createGameOptions(game.options, game.guessedSymbols)
                        }).catch(() => {});
                    } else {
                        let pointsLost = game.isDuel ? 0 : 5;
                        
                        if (game.isDuel) {
                            const opponentStats = stats[game.opponentId] || { points: 0 };
                            const playerStats = stats[userId] || { points: 0 };
                            pointsLost = Math.floor(getPointsForTry(1, 0, true, playerStats.points, opponentStats.points) * 1.5);
                            
                            if (activeGames.has(game.opponentId)) {
                                activeGames.delete(game.opponentId);
                                const opponent = await client.users.fetch(game.opponentId).catch(() => null);
                                if (opponent) {
                                    const opponentPointsGained = Math.floor(pointsLost * 0.5);
                                    updateStats(game.opponentId, opponent.username, opponent.displayName, opponentPointsGained, true);
                                    
                                    try {
                                        const member = await interaction.guild?.members.fetch(game.opponentId).catch(() => null);
                                        if (member) {
                                            const userStats = stats[game.opponentId] || { points: 0 };
                                            const rank = getRank(userStats.points);
                                            await updateRankRole(member, rank);
                                        }
                                    } catch (error) {
                                        console.error('Error updating rank role:', error);
                                    }
                                    
                                    opponent.send({
                                        embeds: [
                                            new EmbedBuilder()
                                                .setTitle('🎉 Duel Won!')
                                                .setDescription(`You won the duel against ${interaction.user.toString()}!`)
                                                .setColor(0x57F287)
                                                .addFields(
                                                    { name: 'Correct Answer', value: `${game.targetSymbol} = ${game.target}`, inline: false },
                                                    { name: 'Points Gained', value: `${opponentPointsGained}`, inline: true }
                                                )
                                        ]
                                    }).catch(console.error);

                                }
                            }
                        }

                        // Update stats for the losing player
                        updateStats(userId, interaction.user.username, interaction.user.displayName, -pointsLost, false);

                        // Update rank role if needed
                        try {
                            const member = await interaction.guild?.members.fetch(userId).catch(() => null);
                            if (member) {
                                const userStats = stats[userId] || { points: 0 };
                                const rank = getRank(userStats.points);
                                await updateRankRole(member, rank);
                            }
                        } catch (error) {
                            console.error('Error updating rank role:', error);
                        }

                        activeGames.delete(userId);

                        // Send loss message to player
                        await interaction.update({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle(game.isDuel ? '💀 Duel Lost' : 'Game Over')
                                    .setDescription(`The correct answer was:\n**${game.targetSymbol}** = ${game.target}`)
                                    .setColor(0xED4245)
                                    .addFields(
                                        { name: 'Your last guess', value: `${symbol} = ${guessedWord}`, inline: true },
                                        { name: 'Points Lost', value: `${pointsLost}`, inline: true },
                                        { name: 'All Guessed Symbols', value: game.guessedSymbols.map(s => `${s} = ${words.find(w => translateToEnchanting(w) === s)}`).join('\n') || 'None', inline: false }
                                    )
                            ],
                            components: []
                        }).catch(() => {});
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        if (interaction.isRepliable()) {
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({
                    content: 'There was an error processing your request.',
                    ephemeral: true
                }).catch(console.error);
            } else {
                await interaction.reply({
                    content: 'There was an error processing your request.',
                    ephemeral: true
                }).catch(console.error);
            }
        }
    }
});

// Handle user updates to keep display names current
client.on('userUpdate', (oldUser, newUser) => {
    if (oldUser.username !== newUser.username && stats[newUser.id]) {
        stats[newUser.id].username = newUser.username;
        fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    }
});

client.on('guildMemberUpdate', (oldMember, newMember) => {
    if (oldMember.displayName !== newMember.displayName && stats[newMember.id]) {
        stats[newMember.id].displayName = newMember.displayName;
        fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    }
});

// Error handling
client.on('error', console.error);
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});

// Login
client.login(token).catch(error => {
    console.error('Failed to login:', error);
    process.exit(1);
});    
startServer();
