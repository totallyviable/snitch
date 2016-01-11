// init

if (! process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var Botkit = require('botkit');
var os = require('os');
var util = require('util');

var controller = Botkit.slackbot({
    debug: true,
});

var bot = controller.spawn({
    token: process.env.token
}).startRTM();

// integrations


controller.on('ambient', function(bot, message){
    console.log("[AMBIENT] " + message.text);

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'white_small_square',
    }, emoji_reaction_error_callback);
});


controller.on('me_message', function(bot, message){
    console.log("[ME MESSAGE] /me " + message.text);

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'white_small_square',
    }, emoji_reaction_error_callback);
});


controller.on('message_changed', function(bot, message){
    console.log("[MESSAGE CHANGED] " + util.inspect(message));

    bot.api.reactions.add({
        timestamp: message.message.ts,
        channel: message.channel,
        name: 'small_orange_diamond',
    }, emoji_reaction_error_callback);
});


controller.on('message_deleted', function(bot, message){
    console.log("[MESSAGE DELETED] " + util.inspect(message));

    bot.startPrivateConversation(message.previous_message, function(err, dm){
        dm.say("I removed the message you deleted from the public record.");
    });
});


controller.on('user_typing', function(bot, message){
    console.log('[TYPING] ' + message.user);
});


// internal integrations

controller.on('tick', function(bot, message){});


controller.hears(['shutdown'],'direct_message,direct_mention,mention',function(bot, message){

    bot.startConversation(message, function(err, convo){
        convo.ask('Are you sure you want me to shutdown?',[
            {
                pattern: bot.utterances.yes,
                callback: function(response, convo) {
                    convo.say('Bye!');
                    convo.next();
                    setTimeout(function() {
                        process.exit();
                    },3000);
                }
            },
        {
            pattern: bot.utterances.no,
            default: true,
            callback: function(response, convo) {
                convo.say('*Phew!*');
                convo.next();
            }
        }
        ]);
    });
});


controller.hears(['uptime','identify yourself','who are you','what is your name'],'direct_message,direct_mention,mention',function(bot, message) {

    var hostname = os.hostname();
    var uptime = formatUptime(process.uptime());

    bot.reply(message,':robot_face: I am a bot named <@' + bot.identity.name + '>. I have been running for ' + uptime + ' on ' + hostname + '.');
});

// helpers

function emoji_reaction_error_callback(err, res) {
    if (err) {
        bot.botkit.log('Failed to add emoji reaction :(', err);
    }
}

function formatUptime(uptime) {
    var unit = 'second';
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'minute';
    }
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'hour';
    }
    if (uptime != 1) {
        unit = unit + 's';
    }

    uptime = uptime + ' ' + unit;
    return uptime;
}
