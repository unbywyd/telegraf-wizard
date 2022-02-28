const { Telegraf, session: Session, Markup } = require('telegraf');
const express = require('express');
const app = express();

let demoProcessEnv = {
    NODE_ENV: 'dev',
    HOST: 'https://example.com',
    PORT: 3000,
    BOT_TOKEN: ''
}

const Bot = new Telegraf(demoProcessEnv.BOT_TOKEN);

let {wizard: Wizard, subscribe : Subscribe, plugins: {i18n, mediaGroup}, close: Close, helpers: {sendAnswerMessage, replyToAnswerMessage, createAction, mergeActions}} = require('./wizard')(Bot, {
    ttl: 12000, // You can assign global settings for all wizards
    stepNotifications: true
    //translator: (context, {module}) => (str) => str // Custom method for translations
});


Bot.use(Session());

// Optional media grouping plugin, 
// you can also use the "group" plugin to group other entities from the same user
Bot.use(mediaGroup({
    types: ['video', 'photo'],
    as: 'gallery'
}));

// optional translation plugin
Bot.use(i18n({
    updateClientLanguage: async (ctx, lng) => {
        return lng; // It is possible to asynchronously return the code of the language of the active user
    }
}));


// Demo of custom step
let step = function(options={}) {
    let name = options.name || 'items_slug';
    return function(done) {
        let scene = this;   
        let items = options.items || [];        
        let buttons = [], actions = [];
        for(let item of items) {
            let action = createAction('item', item.replace(/[^\w\d]+/g, '_'));     
            buttons.push(Markup.button.callback(item, action.action));
            actions.push(action);
        }
        let {action: skipAction, use: useSkipAction} = createAction('skip');
        buttons.push(Markup.button.callback('Skip', skipAction));

        let request = (ctx) => {            
            ctx.reply(options.question ? options.question : 'What your choose?', Markup.inlineKeyboard(buttons))        }

        let {use: useActions, get: getAction} = mergeActions(actions);

        scene.enter(request);    
        scene.action(useActions(), async ctx => {
            try {
                await ctx.answerCbQuery('👍 Nice choose!');
            } catch(e) {
                console.log(e);
            }
            let [action, slug] =  getAction(ctx);              
            done(ctx, {
                [name]: slug
            });
        });
        scene.action(useSkipAction(), async ctx => {
            await ctx.answerCbQuery('👍 Nice choose!');
            let state = ctx.getState();
            if(options.default || state[name] == undefined) {
                state[name] = options.default || null
            }
            done(ctx, state)
        });    

        scene.command('list', ctx => {
            ctx.reply(items.join(', '));
        });
        scene.on('message', ctx => {
            ctx.reply('I do not understand', {
                reply_to_message_id: ctx.message.message_id
            }).then(() => {
                request(ctx);
            });
        });  
    
    }
}

// returns a wizard context that can be accessed
/*
*   wizard.next(context)
*   wizard.nextTo(context, sceneId)
*   wizard.finish(context)
*   wizard.leave(context)
*   wizard.getState(context)
*   wizard.prev(context)
*   wizard.getCurrentStepNumber(context)
*/
let wizard = new Wizard('virtual_shop', {
    display_name: 'Virtual shop', // if plugin i18 will be used then it will be translated   
    completed: (context, data) => {
        console.log('Wizard completed: ', data);
    },
    exitMessage: (context, state) => 'virtual_shop wizard completed!'
});

wizard.addScene({
    id: 'message'
}, function(done) {
    let scene = this;
    let request = (ctx) => {
        sendAnswerMessage(ctx, () => {
            return ctx.reply('What your message?')
        });
    }
    scene.enter(request);
    scene.on('message', ctx => {
        replyToAnswerMessage(ctx, `Your message: ${ctx.message.text}`).then(done(ctx, {message: ctx.message.text}));
    });
}, function() {
    this.nextTo('vegetables'); // Jump to specific step  
});

wizard.addScene({
    id: 'fruits'
}, step({
    items: ['orange', 'grape', 'apple'],
    question: 'Choose a fruit',
    name: 'fruit_slug',
    default: 'grape'
}), function() { 
    this.next(); // Default action, the same as without this function
});

wizard.addScene({
    id: 'vegetables'
}, step({
    items: ['potatoes', 'a tomato', 'cucumber'],
    question: 'Choose a vegetable',
    name: 'vegetable_slug'
}));

new Wizard('equipment_store', {
    display_name: 'Equipment shop', // if plugin i18 will be used then it will be translated
    displaySceneNamesOnStepper: true, // display scene names, not numbering, needed if the wizard has a dynamic number of steps
    completed: () => {
        console.log('This wizard will not end, because we break it and pass data to another wizard');
    }   
});

// Get scene from Bot.Wizards
let wizard2 = Bot.Wizards.get('equipment_store');

wizard2.addScene({
    id: 'cars',
    display_name: 'Car selection' // if plugin i18 will be used then it will be translated
}, step({
    items: ['BMW', 'Audi', 'Feat'],
    question: 'Choose a car',
    name: 'car_slug'
}));

wizard2.addScene({
    id: 'washing_machine',
    display_name: 'Washing machine selection'
}, step({
    items: ['LG', 'Samsung', 'Coco'],
    question: 'Choose a washing machine',
    name: 'washing_machine_slug'
}), function() {
    this.nextTo('cars'); // jump to the cars step 
});

wizard2.addScene({
    id: 'technique',
    display_name: 'Technique selection'
}, step({    
    items: ['a vacuum cleaner', 'fridge', 'television'],
    question: 'Choose a technique',
    name: 'technique_slug'
}), function() {
    this.toWizard('virtual_shop', {
        options: {
            skipStartMessageAndControls: true // Apply wizard options relative to context
        },
        payload: this.getState() // Jump to other wizard with payload of current wizard, this wizard will not complete!
    });
});

// Subscribe all wizards to the bot, you need to do this after setting up wizards and before global commands
Subscribe();

/*  Custom subscribe
*   Subscribe((bot, middleware) => {
*       bot.use(Composer.acl(['userId'], middleware));
*   });
*/
Bot.command('shop', wizard.begin.bind(wizard));
Bot.command('shop2', (ctx) => { 
    wizard2.begin(ctx, {
        sceneId: 'washing_machine', // Start from specific scene
        payload: {
            washing_machine_slug: 'samsung',
            car_slug: 'bmw'
        }
    });
});

Bot.command('global', (ctx, next) => {
    console.log(actions);
});
Bot.action('global', (ctx, next) => {
    ctx.reply('Global action');
});

// Be sure to end the bot application using the close method
Close();


if(demoProcessEnv.NODE_ENV == "dev") {
    /*
    *   Running the bot in development
    */
    Bot.launch().catch(e => {
        console.log(e);
    });

    process.once('SIGINT', () => Bot.stop('SIGINT'))
    process.once('SIGTERM', () => Bot.stop('SIGTERM'))         
} else {
    /*
    *   Running the bot in production using a web hook
    */
    const secretPath = `/telegraf/${Bot.secretPathComponent()}`;
    Bot.telegram.setWebhook(`https://${demoProcessEnv.HOST}${secretPath}`);    
    app.use(Bot.webhookCallback(secretPath));   
    app.listen(demoProcessEnv.PORT, () => {
        console.log(`App listening on port ${demoProcessEnv.PORT}! with webhook: https://${demoProcessEnv.HOST}${secretPath}`);
    });
}
