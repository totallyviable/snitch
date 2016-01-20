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
    simple_latest: true,
    no_unreads: true,
    token: process.env.SLACK_BOT_TOKEN
}).startRTM(function(err, bot, res){
    if (err || ! res.ok) {
        bot.botkit.log("Error caching startRTM payload.");
        return;
    }

    cache.users = {};
    _.each(res.users, function(item){
        cache.users[item.id] = item;
    });

    _.each(res.bots, function(item){
        cache.users[item.id] = item;
    });

    cache.channels = {};
    _.each(res.channels, function(item){
        cache.channels[item.id] = item;
    });
});

// integrations

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
        text: reformat_message_text(message.text)
    });

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'white_small_square',
    }, emoji_reaction_error_callback);
});

controller.on('bot_message', function(bot, message){
    bot.botkit.log("[BOT MESSAGE] " + message.text);

    var timestamp = message.ts.split(".")[0];

    io.emit('message', {
        timestamp: timestamp,
        channel: sanitized_channel(message.channel),
        user: sanitized_user(message.bot_id),
        text: reformat_message_text(message.text)
    });

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'white_small_square',
    }, emoji_reaction_error_callback);
});

controller.on('me_message', function(bot, message){
    message.text = "/me " + message.text;

    bot.botkit.log("[ME MESSAGE] " + message.text);

    var timestamp = message.ts.split(".")[0];

    io.emit('message', {
        timestamp: timestamp,
        channel: sanitized_channel(message.channel),
        user: sanitized_user(message.user),
        text: reformat_message_text(message.text)
    });

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'white_small_square',
    }, emoji_reaction_error_callback);
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


controller.hears(['uptime'],'direct_message,direct_mention,mention',function(bot, message) {

    var hostname = os.hostname();
    var uptime = process.uptime();
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


function reformat_message_text(text) {
    // https://api.slack.com/docs/formatting
    text = text.replace(/<([@#!])?([^>|]+)(?:\|([^>]+))?>/g, (function(_this) {
        return function(m, type, link, label) {
            var channel, user;

            switch (type) {
                case '@':
                    if (label) return label;

                    user = cache.users[link];

                    if (user) return "@" + user.name;

                    break;
                case '#':
                    if (label) return label;
                    
                    channel = cache.channels[link];
                    
                    if (channel) return "\#" + channel.name;
                    
                    break;
                case '!':
                    if (['channel','group','everyone','here'].indexOf(link) >= 0) {
                        return "@" + link;
                    }

                    break;
                default:
                    if (label && -1 !== link.indexOf(label)) {
                        return "<a href='" + link + "'>" + label + "</a>";
                    } else {
                        return "<a href='" + link + "'>" + link.replace(/^mailto:/, '') + "</a>";
                    }
            }
        };
    })(this));

    // text = text.replace(/&lt;/g, '<');
    // text = text.replace(/&gt;/g, '>');
    // text = text.replace(/&amp;/g, '&');

    // nl2br
    text = text.replace(/\n/g, "<br/>");

    // me_message
    if (text.indexOf("/me") === 0) {
        text = "<span class='me_message'>" + text + "</span>";
    }

    return text;
}

function emoji_reaction_error_callback(err, res) {
    if (err) {
        bot.botkit.log('Failed to add emoji reaction :(', err);
    }
}

