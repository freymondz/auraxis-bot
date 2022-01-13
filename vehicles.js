// This file defines functions to look up a player's stats with a given vehicle

const Discord = require('discord.js');
const {censusRequest} = require('./utils.js');
const vehicles = require('./static/parsedVehicles.json');
const {getWeaponName} = require('./character.js');

const vehicleOverview = async function(cName, vehicleID, platform){
	const response = await censusRequest(platform, 'character_list', `/character?name.first_lower=${cName.toLowerCase()}&c:resolve=weapon_stat_by_faction,weapon_stat`);
	if(response.length == 0){
        throw `${cName} not found`;
    }
	const data = response[0];

	let topWeaponID = -1;
	let topWeaponKills = 0;
	let playTime = 0;
	let totalKills = 0;
	let totalDeaths = 0;
	let score = 0;
	let weaponKills = 0;
	let vehicleKills = 0;

	for(const stat of data.stats.weapon_stat){
		if(stat.item_id == "0" && stat.vehicle_id == vehicleID){
			if(stat.stat_name == "weapon_deaths"){
				totalDeaths = Number.parseInt(stat.value);
			}
			else if(stat.stat_name == "weapon_play_time"){
				playTime = Number.parseInt(stat.value);
			}
			else if(stat.stat_name == "weapon_score"){
				score = Number.parseInt(stat.value);
			}
		}
	}
	for(const stat of data.stats.weapon_stat_by_faction){
		if(stat.item_id == "0" && stat.vehicle_id == vehicleID){
			if(stat.stat_name == "weapon_kills"){
				totalKills = Number.parseInt(stat.value_vs) + Number.parseInt(stat.value_nc) + Number.parseInt(stat.value_tr);
			}
			else if(stat.stat_name == "weapon_vehicle_kills"){
				vehicleKills = Number.parseInt(stat.value_vs) + Number.parseInt(stat.value_nc) + Number.parseInt(stat.value_tr);
			}
		}
		else if(stat.vehicle_id == vehicleID && stat.stat_name == "weapon_kills"){
			const kills = Number.parseInt(stat.value_vs) + Number.parseInt(stat.value_nc) + Number.parseInt(stat.value_tr);
			weaponKills += kills;
			if(kills > topWeaponKills){
				topWeaponID = stat.item_id;
				topWeaponKills = kills;
			}
		}
	}
	return {
		charName: data.name.first,
		faction: data.faction_id,
		playTime: playTime,
		totalKills: totalKills,
		weaponKills: weaponKills,
		vehicleKills: vehicleKills,
		totalDeaths: totalDeaths,
		score: score,
		topWeaponID: topWeaponID,
		topWeaponKills: topWeaponKills
	}
}

module.exports = {
	vehicle: async function(cName, vehicleID, platform){
		let vehicleName = "";
		let imageID = -1;
		if(vehicleID.indexOf("[") > -1){
			// Account for autocomplete breaking
			const splitList = vehicleID.split("[")
			vehicleID = splitList[splitList.length-1].split("]")[0];
		}
		if(vehicleID in vehicles){
			vehicleName = vehicles[vehicleID].name;
			imageID = vehicles[vehicleID].image;
		}
		else{
			const input = vehicleID.toLowerCase();
			for(const vid in vehicles){
				if(vehicles[vid].name.toLowerCase().indexOf(input) > -1){
					vehicleID = vid;
					vehicleName = vehicles[vid].name;
					imageID = vehicles[vid].image;
					break;
				}
			}
			if(vehicleName == ""){
				throw "Input not recognized";
			}
		}

		const vInfo = await vehicleOverview(cName, vehicleID, platform);
		if(vInfo.score == 0 && vInfo.playTime == 0){
			throw `${vInfo.charName} has not used the ${vehicleName}`;
		}
		let resEmbed = new Discord.MessageEmbed();

		resEmbed.setTitle(vInfo.charName);
		resEmbed.setDescription(vehicleName);
		resEmbed.setThumbnail(`http://census.daybreakgames.com/files/ps2/images/static/${imageID}.png`)
		// Faction, embed color
        if (vInfo.faction == "1"){ //vs
            resEmbed.setColor('PURPLE');
        }
        else if (vInfo.faction == "2"){ //nc
            resEmbed.setColor('BLUE');
        }
        else if (vInfo.faction == "3"){ //tr
            resEmbed.setColor('RED');
        }
        else{ //NSO
            resEmbed.setColor('GREY');
        }

		const hoursPlayed = Math.floor(vInfo.playTime/3600);
		const minutesPlayed = Math.floor(vInfo.playTime/60 - hoursPlayed*60);
		resEmbed.addField("Playtime", `${hoursPlayed}h ${minutesPlayed}m`, true);
		resEmbed.addField("Score (SPM)", `${vInfo.score.toLocaleString()} (${(vInfo.score/vInfo.playTime*60).toPrecision(4).toLocaleString()})`, true);
		resEmbed.addField("Weapon kills", vInfo.weaponKills.toLocaleString(), true);
		resEmbed.addField("Road kills", (vInfo.totalKills-vInfo.weaponKills).toLocaleString(), true);
		resEmbed.addField("Total KPM", (vInfo.totalKills/vInfo.playTime*60).toPrecision(3), true);
		resEmbed.addField("Vehicle kills (KPM)", `${vInfo.vehicleKills.toLocaleString()} (${(vInfo.vehicleKills/vInfo.playTime*60).toPrecision(3)})`, true);
		resEmbed.addField("Deaths", vInfo.totalDeaths.toLocaleString(), true);
		if(vInfo.topWeaponID != -1){
			const topWeaponName = await getWeaponName(vInfo.topWeaponID, platform);
			resEmbed.addField("Top Weapon (kills)", `${topWeaponName} (${vInfo.topWeaponKills.toLocaleString()})`, true);
		}

		return resEmbed;
	},

	partialMatches: async function(query){
		let matches = [];
		query = query.replace(/[“”]/g, '"').toLowerCase();
		for(const id in vehicles){
			if(vehicles[id].name.toLowerCase().indexOf(query) > -1){
				matches.push({name: `${vehicles[id].name} [${id}]`, value: id});
			}
			if(matches.length >= 25){
				break;
			}
		}
		return matches;
	}
}