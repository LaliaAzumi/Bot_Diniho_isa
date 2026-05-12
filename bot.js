const token = process.env.DISCORD_TOKEN;
console.log('Token chargé :', token ? 'OUI' : 'NON');
const http = require('http');
http.createServer((req, res) => res.end('Bot en ligne')).listen(process.env.PORT || 3000);
const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

const games = new Map();

const PREFIX = '!';
const MIN = 1;
const MAX = 100;

client.once('ready', () => {
    console.log(`✅ Bot "Devine mon chiffre" prêt : ${client.user.tag}`);
});
client.on('messageCreate', async (message) => {
    console.log(`Message reçu : ${message.content} de ${message.author.tag}`);
});
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args[0].toLowerCase();

    if (command === 'defi') {
        if (games.has(message.channel.id)) {
            return message.reply('❌ Une partie est déjà en cours dans ce salon !');
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`join_game_${message.author.id}`)
                    .setLabel('Rejoindre le Duel')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`cancel_game_${message.author.id}`)
                    .setLabel('Annuler')
                    .setStyle(ButtonStyle.Secondary)
            );

        const embed = new EmbedBuilder()
            .setColor('#F4A62A')
            .setTitle('🎯 Défi Ouvert !')
            .setDescription(`**${message.author.username}** lance un duel !\n\nClique sur le bouton ci-dessous pour rejoindre la partie.`)
            .setFooter({ text: `Chiffres entre ${MIN} et ${MAX}` });

        await message.channel.send({ embeds: [embed], components: [row] });
    }
});

client.on('interactionCreate', async (interaction) => {
    
    if (interaction.isButton()) {
        const customId = interaction.customId;

        // Rejoindre la partie
        if (customId.startsWith('join_game_')) {
            const challengerId = customId.split('_')[2];
            if (interaction.user.id === challengerId) {
                return interaction.reply({ content: "Tu ne peux pas rejoindre ton propre défi !", ephemeral: true });
            }

            games.set(interaction.channelId, {
                p1: challengerId,
                p2: interaction.user.id,
                num1: null,
                num2: null,
                turn: challengerId,
                guesses1: [],
                guesses2: [],
                phase: 'choosing'
            });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_number')
                    .setLabel('Définir mon Chiffre Secret')
                    .setStyle(ButtonStyle.Success)
            );

            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle('🔒 Phase de préparation')
                .setDescription(`Duel : <@${challengerId}> vs <@${interaction.user.id}>\n\nCliquez sur le bouton pour choisir votre chiffre. C'est secret !`);

            await interaction.update({ content: null, embeds: [embed], components: [row] });
        }

        if (customId.startsWith('cancel_game_')) {
            const challengerId = customId.split('_')[2];
            if (interaction.user.id !== challengerId) return interaction.reply({ content: "Seul l'auteur peut annuler.", ephemeral: true });
            return interaction.update({ content: '❌ Défi annulé.', embeds: [], components: [] });
        }

        if (customId === 'setup_number' || customId === 'guessbtn_action' || customId === 'guessbtn_next') {
            const game = games.get(interaction.channelId);
            if (!game) return interaction.reply({ content: "Partie introuvable.", ephemeral: true });

            if (interaction.user.id !== game.p1 && interaction.user.id !== game.p2) {
                return interaction.reply({ content: "Tu n'es pas dans ce duel.", ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId(game.phase === 'choosing' ? 'modal_setup' : 'modal_guess')
                .setTitle(game.phase === 'choosing' ? 'Choix du Chiffre Secret' : 'Ta Proposition');

            const input = new TextInputBuilder()
                .setCustomId('number_input')
                .setLabel(`Entrez un nombre (${MIN}-${MAX})`)
                .setStyle(TextInputStyle.Short)
                .setMinLength(1)
                .setMaxLength(3)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }
    }

    if (interaction.isModalSubmit()) {
        const game = games.get(interaction.channelId);
        if (!game) return interaction.reply({ content: "Erreur : partie introuvable.", ephemeral: true });

        const val = parseInt(interaction.fields.getTextInputValue('number_input'));

        if (isNaN(val) || val < MIN || val > MAX) {
            return interaction.reply({ content: `Nombre invalide ! Choisis entre ${MIN} et ${MAX}.`, ephemeral: true });
        }

        if (interaction.customId === 'modal_setup') {
            if (interaction.user.id === game.p1) game.num1 = val;
            if (interaction.user.id === game.p2) game.num2 = val;

            if (game.num1 !== null && game.num2 !== null) {
                game.phase = 'playing';
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('guessbtn_action')
                        .setLabel('Deviner le chiffre')
                        .setStyle(ButtonStyle.Primary)
                );
                
                const startEmbed = new EmbedBuilder()
                    .setColor('#2ECC71')
                    .setTitle('🎮 Le Duel commence !')
                    .setDescription(`Les chiffres secrets sont enregistrés !\n\nC'est au tour de <@${game.p1}> de commencer.`);

                await interaction.reply({ content: `✅ Ton chiffre (${val}) est enregistré !`, ephemeral: true });
                await interaction.channel.send({ embeds: [startEmbed], components: [row] });
            } else {
                await interaction.reply({ content: "✅ Chiffre enregistré ! En attente de l'adversaire...", ephemeral: true });
            }
        }

        if (interaction.customId === 'modal_guess') {
            if (interaction.user.id !== game.turn) {
                return interaction.reply({ content: "⏳ Ce n'est pas ton tour !", ephemeral: true });
            }

            const isP1 = (interaction.user.id === game.p1);
            const target = isP1 ? game.num2 : game.num1;
            const history = isP1 ? game.guesses1 : game.guesses2;
            
            history.push(val);

      
            if (val === target) {
                // On récupère les objets "User" pour obtenir leurs noms
                const user1 = await client.users.fetch(game.p1);
                const user2 = await client.users.fetch(game.p2);

                const winEmbed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🏆 VICTOIRE !')
                    .setDescription(`<@${interaction.user.id}> a trouvé le chiffre secret !`)
                    .addFields(
                        { name: `🎯 Chiffre de ${user1.username}`, value: `**${game.num1}**`, inline: true },
                        { name: `🎯 Chiffre de ${user2.username}`, value: `**${game.num2}**`, inline: true },
                        { name: '📊 Tentatives du gagnant', value: `${history.length}`, inline: false }
                    )
                    .setFooter({ text: 'Partie terminée ! Tapez !defi pour rejouer.' });

                await interaction.reply({ embeds: [winEmbed], components: [] });
                return games.delete(interaction.channelId);
            }

            game.turn = isP1 ? game.p2 : game.p1;
            const hint = val < target ? "🔺 **C'est plus haut !**" : "🔻 **C'est plus bas !**";

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('guessbtn_next')
                    .setLabel('Deviner')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({ 
                content: `🗨️ <@${interaction.user.id}> a proposé **${val}**...\n${hint}\n\nAu tour de <@${game.turn}> !`, 
                components: [row] 
            });
        }
    }
});
client.login(token).catch(err => console.error('Erreur login:', err));
client.login(token);