// This file defines functions to update previously sent alert notifications

const Discord = require('discord.js');
var got = require('got');
var alerts = require('./alerts.json');

const serverIdToName = function(server){
	switch(server){
		case 1:
			return "Connery";
		case 10:
			return "Miller";
		case 13:
			return "Cobalt";
		case 17:
			return "Emerald";
		case 19:
			return "Jaegar";
		case 40:
			return "SolTech";
		case 1000:
			return "Genudine";
		case 2000:
			return "Ceres";
	}
}

const popLevels = {
	1: "Dead",
	2: "Low",
	3: "Medium",
	4: "High",
	5: "Prime"
}

const winnerFaction = {
	1: "<:VS:818766983918518272> VS win",
	2: "<:NC:818767043138027580> NC win",
	3: "<:TR:818988588049629256> TR win",
}

const updateAlert = async function(info, pgClient, discordClient, isComplete){
	let messageEmbed = new Discord.MessageEmbed();
	messageEmbed.setTimestamp();
	messageEmbed.setFooter("Data from ps2alerts.com");
	let alertName = alerts[info.censusMetagameEventType].name
	messageEmbed.setTitle(alertName);
	if (alertName.includes('Enlightenment')){
		messageEmbed.setColor('PURPLE');
	}
	else if (alertName.includes('Liberation')){
		messageEmbed.setColor('BLUE');
	}
	else if (alertName.includes('Superiority')){
		messageEmbed.setColor('RED');
	}
	messageEmbed.setDescription(`[${alerts[info.censusMetagameEventType].description}](https://ps2alerts.com/alert/${info.instanceId}?utm_source=auraxis-bot&utm_medium=discord&utm_campaign=partners)`)
	messageEmbed.addField("Server", serverIdToName(info.world), true);
	if(isComplete){
		messageEmbed.addField("Status", "Ended", true);
	}
	else{
		let now = Date.now();
		let start = Date.parse(info.timeStarted);
		let timeLeft = (start+info.duration)-now
		let hoursleft = Math.floor(timeLeft/3600000);
		let minutesleft = Math.floor(timeLeft/60000) - hoursleft*60;
		messageEmbed.addField("Status", `${hoursleft}h ${minutesleft}m remaining`, true);
	}
	messageEmbed.addField("Population", popLevels[info.bracket], true);
	messageEmbed.addField("Territory Control", `\
	\n<:VS:818766983918518272> **VS**: ${info.result.vs}%\
	\n<:NC:818767043138027580> **NC**: ${info.result.nc}%\
	\n<:TR:818988588049629256> **TR**: ${info.result.tr}%`, true);
	if(isComplete){
		if(info.result.draw){
			messageEmbed.addField("Result", "Draw", true);
		}
		else{
			messageEmbed.addField("Result", winnerFaction[info.result.victor], true);
			if (!(info.result.victor in winnerFaction)){
				isComplete = false; //Don't delete from list, retry later when field may be populated
			}
		}
	}
	

	pgClient.query("SELECT messageID, channelID FROM alertMaintenance WHERE alertID = $1;", [info.instanceId])
	.then(rows => {
		for(let row of rows.rows){
			editMessage(messageEmbed, row.messageid, row.channelid, discordClient)
				.then(function(){
					if(isComplete){
						pgClient.query("DELETE FROM alertMaintenance WHERE alertID = $1;", [info.instanceId])
					}
				})
				.catch(err => {
					console.log(err)
				})
		}	
	})
}

const editMessage = async function(embed, messageId, channelId, discordClient){
	discordClient.channels.fetch(channelId)
	.then(resChann => {
		if(resChann.type != 'dm' && resChann.permissionsFor(resChann.guild.me).has('VIEW_CHANNEL')){
			resChann.messages.fetch(messageId)
			.then(resMsg => {
				resMsg.edit(embed)
				.catch(err => {
					return new Promise(function(resolve, reject){
						reject(err);
					})
				})
			})
			.catch(err => {
				// ignore, will be cleaned up on alert end
			})
		}
	})
	.catch(err => {
		// ignore, will be cleaned up on alert end
	})
}

module.exports = {
	update: async function(pgClient, discordClient){
		pgClient.query("SELECT DISTINCT alertID, error FROM alertMaintenance")
		.then(rows => {
			for(let row of rows.rows){
				got(`https://api.ps2alerts.com/instances/${row.alertid}`).json()
					.then(response => {updateAlert(response, pgClient, discordClient, "timeEnded" in response);})
					.catch(err =>{
						if(row.error){
							pgClient.query("DELETE FROM alertMaintenance WHERE alertID = $1;", [row.alertid]);
						}
						else{
							pgClient.query("UPDATE alertMaintenance SET error = true WHERE alertID = $1;", [row.alertid]);
							console.log("Error retrieving alert info from PS2Alerts");
							console.log(err);
						}
					})
			}
		})
		.catch(err => {})
	}
}