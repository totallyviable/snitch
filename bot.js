// init

if (! process.env.SLACK_BOT_TOKEN) {
    console.error('Error: Specify SLACK_BOT_TOKEN in environment');
    process.exit(1);
}

if (! process.env.PORT) {
    process.env.PORT = 3000;
}

var os = require('os');
var util = require('util');
var _ = require('underscore');

var Botkit = require('botkit');

var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

// web server

app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html');
});

http.listen(process.env.PORT, function(){
    console.log('listening on port ' + process.env.PORT);
});

var cache = {
    users: {},
    channels: {},
};

// slackbot

var controller = Botkit.slackbot({
    debug: true,
});

var bot = controller.spawn({
    token: process.env.SLACK_BOT_TOKEN
}).startRTM();

// integrations

cache_list('users');
cache_list('channels');

controller.on('channel_created', function(bot, message){
    cache_list('channels');

    // TODO: update clients
});

controller.on('channel_deleted', function(bot, message){
    cache_list('channels');

    // TODO: update clients
});

controller.on('channel_rename', function(bot, message){
    cache_list('channels');

    // TODO: update clients
});

controller.on('channel_archive', function(bot, message){
    cache_list('channels');

    // TODO: update clients
});

controller.on('channel_unarchive', function(bot, message){
    cache_list('channels');

    // TODO: update clients
});

controller.on('user_channel_join', function(bot, message){
    cache_list('channels');

    // TODO: update clients
    // console.log(util.inspect(message));
});

controller.on('channel_leave', function(bot, message){
    cache_list('channels');

    // TODO: update clients
    // console.log(util.inspect(message));
});



controller.on('ambient', function(bot, message){
    bot.botkit.log("[AMBIENT] " + message.text);

    var timestamp = message.ts.split(".")[0];

    io.emit('message', {
        timestamp: timestamp,
        channel: sanitized_channel(message.channel),
        user: sanitized_user(message.user),
        text: message.text
    });

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'white_small_square',
    }, emoji_reaction_error_callback);
});


controller.on('me_message', function(bot, message){
    bot.botkit.log("[ME MESSAGE] /me " + message.text);

    // TODO: process like ambient messages
});


controller.on('message_changed', function(bot, message){
    bot.botkit.log("[MESSAGE CHANGED] " + util.inspect(message));

    // TODO: update clients

    bot.api.reactions.add({
        timestamp: message.message.ts,
        channel: message.channel,
        name: 'small_orange_diamond',
    }, emoji_reaction_error_callback);
});


controller.on('message_deleted', function(bot, message){
    bot.botkit.log("[MESSAGE DELETED] " + util.inspect(message));

    // TODO: update clients

    bot.startPrivateConversation(message.previous_message, function(err, dm){
        dm.say("I removed the message you deleted from the public record.");
    });
});


controller.on('user_typing', function(bot, message){
    bot.botkit.log('[TYPING] ' + message.user);

    io.emit('typing', {
        channel: sanitized_channel(message.channel),
        user: sanitized_user(message.user)
    });
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

function cache_list(variant) {
    var options = {
        api_method: variant,
        response_wrapper: variant
    };

    // allow overriding abnormal param names

    if (variant == 'users') {
        options.response_wrapper = 'members';
    }

    bot.api[options.api_method].list({}, function(err, res){
        if (err || ! res.ok) bot.botkit.log("Error calling bot.api." + options.api_method + ".list");

        cache[options.api_method] = {};

        _.each(res[options.response_wrapper], function(item){
            cache[options.api_method][item.id] = item;
        });

        // console.log(util.inspect(cache[options.api_method]));
    });
}

function sanitized_user(user){
    var user = cache.users[user];

    if (! user) {
        bot.botkit.log("Could not find cached user");
        return { name: 'User' };
    }

    user = _.pick(user, 'name', 'color', 'profile');

    user.profile = _.pick(user.profile, 'first_name', 'last_name', 'real_name', 'image_192');
    user.profile.image = user.profile.image_192;

    return user;
}

function sanitized_channel(channel){
    var channel = cache.channels[channel];
    
    if (! channel) {
        bot.botkit.log("Could not find cached channel");
        return { name: '#channel' };
    }

    channel = _.pick(channel, 'name', 'topic', 'members');

    channel.topic = channel.topic.value;

    var members = {};
    _.each(channel.members, function(id){
        var user = sanitized_user(id);
        members[user.name] = user;
    });
    channel.members = members;

    return channel;
}

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
