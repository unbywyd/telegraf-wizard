## Telegraf.js Wizard
This add-on provides grouping of BaseScenes into wizards

### Get Started

[Just use this demo file](https://github.com/unbywyd/telegraf-wizard/blob/master/demo.js)

### Features
* Multiple number of wizards
* Creating linear wizards (when moving through the scenes relative to the order in which they were added to the wizard)
* Creation of non-linear wizards (You can register any number of scenes and move through them in a chaotic manner)
* Multilingual support (added custom simple plugin i18n and 4 default languages: russian, english, hebrew, uzbek), you can create your own translator and pass it to the wizard options 
* Moving not only through the scenes of the wizard, but also from the wizard to another wizard
* Navigation (step back, exit, pinned message with active step status)
* Additional plugins and tools (Media group, grouping messages by type and more)


### Usage

####  Include the wizard and pass your bot to it
*It can be a main telegraf bot, or a bot created by a composer*


```js
const { Telegraf, session: Session } = require('telegraf');
const Bot = new Telegraf(BOT_TOKEN);

let {wizard: Wizard, subscribe, close, plugins: {i18n, mediaGroup, group}, helpers: {sendAnswerMessage, replyToAnswerMessage, createAction, prepareActions}} = require('./wizard')(Bot, {
    ttl: 12000, // here you can pass global settings for all wizards
});

Bot.use(Session()); // required must be used before plugins
Bot.use(i18n()); // translation plugin

```

#### Create wizards

*You can create wizards and override global settings*

```js
let wizard = new Wizard('virtual_shop', {
    display_name: 'Virtual shop', // if plugin i18 will be used then it will be translated   
    completed: (context, data) => {
        console.log('Wizard completed: ', data);
    }
});

new Wizard('equipment_store', {
    display_name: 'Equipment shop', // if plugin i18 will be used then it will be translated
    displaySceneNamesOnStepper: true, // display scene names, not numbering, needed if the wizard has a dynamic number of steps
});
```

#### Add Scenes to Wizards

*Every step is a scene that should end with a callback*

```js
let step = function(callback) {
    let scene = this;
    let request = (ctx) => {
        sendAnswerMessage(ctx, () => {
            return ctx.reply('What your message?')
        });
    }
    scene.enter(request);
    scene.on('message', ctx => {
        replyToAnswerMessage(ctx, `Your message: ${ctx.message.text}`).then(callback(ctx, {message: ctx.message.text}));
    });
}

wizard.addScene({
    id: 'message'
}, step, function() {
    this.nextTo('vegetables'); // Jump to specific step  
});

wizard.addScene({
    id: 'fruits'
}, step2, function() { 
    this.next(); // Default action, the same as without this function
});

wizard.addScene({
    id: 'vegetables'
}, step3);


let equipmentStoreWizard = Bot.Wizards.get('equipment_store');
equipmentStoreWizard.addScene({
    id: 'cars',
    display_name: 'Car selection'
}, stepCars);

....
```

#### subscribe our wizards to the bot

* After adding all scenes wizards *
```js
subscribe()
```

#### Use global commands to call wizards after subscribing 

```js
Bot.command('shop', wizard.begin.bind(wizard));

Bot.command('shop2', (ctx) => { 
    Bot.Wizards.get('equipment_store').begin(ctx, {
        sceneId: 'washing_machine', // Start from specific scene
        payload: { // Start with payload
            car_slug: 'bmw'
        }
    });
});

// All other global actions and commands
```

### end your bot application with the close method

```js
close();
```

### Documentation
- [Wizard options](#wizard-options)
- [Wizard](#wizard)
- [subscribe](#subscribe)
- [close](#close)
- [Plugins](#plugins)
    - [i18n](#plugin-i18n)
    - [mediaGroup](#plugin-mediagroup)
    - [group](#plugin-group)

#### Wizard options

Wizard options can be passed in the following ways:
* Global for all wizards for one bot
```js
let {wizard: Wizard, subscribe, close} = require('./wizard')(Bot, {
    ... // here
});
```
* per-wizard
```js
let wizard = new Wizard('virtual_shop', {
    ..// here
});
```
* per-context
```js
wizard.begin(context, {
    options: {
        ... // here
    },
})
```

#### Options
```js
{
    translator: (context, {module}) // global option only, custom i18n translation function
    localeName: 'wizard', // Module name for i18n plugin
    began: (context) => {},  // callback when running wizard for user, this = wizard
    completed: (context, data) => {}, // when the wizard ended for the user, data - combined data of all wizard scenes, this = wizard            
    controls: true,  // Back and Exit buttons
    displaySceneNamesOnStepper: null, // For non-linear wizards, show scene names
    actionUnknownMessage: 'action_unknown', // message when buttons are out of date
    exitMessage: null, // <string | function(context, data)> message when exiting the wizard, <string> - will be translated by the i18n plugin
    skipStartMessageAndControls: false, // when jumping from a wizard to another wizard it is convenient to turn off the greeting
    timeOutMessage: 'timeout_message', //  <string | function(context, data)>, <string> - will be translated by the i18n plugin
    pauseHandler: () => {}, // Pause custom handler, by default blocks all messages and events
    stepNotifications: true, // show pinned message and notify about active scene
    finishStickerId: 'CAACAgIAAxkBAAEDy9Vh-5AL-L6ToYP4m-8BQ27NOQ4YzgACTQADWbv8JSiBoG3dG4L3IwQ' // <sticker id or false> wizard completion sticker
}
```

#### Wizard

Groups scenes into a single wizard

```js
let {wizard: Wizard, subscribe, close} = require('./wizard')(Bot);

let wizard = new Wizard('wizardId', {
    ... // options
});

wizard.addScene(...)
... // More scenes
subscribe();
// Global commands
close();
```

##### Methods
###### addScene
- addScene(options={}, step<function>, next<function>), the method adds a scene to the wizard
    - options:
    
    ```js
    {
        "id": "sceneId", // required,
        "display_name": "sceneName", 
        "replace_stepper_name", // To locally override a global displaySceneNamesOnStepper variable
    }
    ```
    
    - step(callback): // required
        A function that asks a question and returns a response from the user via callback
    
    - next(context) <this = wizard>
        Optional method to manually control the next step of the wizard, called after the data from the step callback has been saved, the following methods are available:
        - toWizard(wizardId, data)
        - next()
        - nextTo(sceneId)
        - getState()
        - finish()
        - leave()
        - getCurrentStepNumber()
        - prev()
        these are wizard methods, but they have already accepted the current context, so there is no need to pass the context
        

**Example**

```js
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

        let {use: useActions, get: getAction} = prepareActions(actions);

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
```

###### begin(context, options={})

Run wizard, **options:**
```js
{
    payload: {}, // setting default values
    sceneId: 'sceneId' // id of the scene where to start the wizard
    options: {
        ... // overwrite wizard options for specific context
    }
}
```

###### getState(context)

Returns the current payload of the wizard. Each wizard consists of steps, when the step ends callback is called and data is passed to it, this data is combined with the payload of wizard

###### next(context)

Go to the next step in the sequence in which the scenes were added to the wizard. If the nextTo method was used after any wizard step, then this step will be skipped

###### nextTo(context, sceneId)

Jump to a specific wizard step

###### prev(context)

go to previous step

###### getCurrentStepNumber(context)

get current scene number (not suitable for non-linear wizard)

###### finish(context)

will finish the wizard, if there is data it will be passed to the complete callback of the wizard

###### leave(context)

will delete all wizard data and exit


#### subscribe(customSubscribe<function>)

subscribing the middleware to the bot. You can pass a callback for your own subscription

```js
Subscribe((bot, middleware) => {
    bot.use(Composer.acl(['userId'], middleware));
 });
```

#### close(options={})

This method handles edge cases and cleans up "non-live" wizards whose session has expired

*Options will be inherited from global options*
Options: 

```
{
    localeName: 'wizard',
    actionUnknownMessage: 'action_unknown',
    messageUnknownMessage: 'message_unknown',
    timeOutMessage: 'timeout_message',
    removeOldActions: false
}
```

#### Plugins

##### i18n

Translation Plugin, include after session plugin, works with the **handlebars** templating engine

```js
Bot.use(i18n({
    useUserLanguage : true, // uses telegram language
    defaultLanguage:  'en', 
    dirLanguagesPath: './languages', // directory of i18n modules, path relative to process.cwd()
    slug: 'i18n',
    updateClientLanguage: async (ctx, lng) => {
        return lng; // It is possible to asynchronously return the code of the language of the active user
    }
}));
```

**Usage:**

Create a module file (/languages/wizard.yaml) and put there lines regarding keys and languages:

```YAML
your_message: 
 en: Your message {{message}}
 ru: Ваше сообщение {{message}}
```

and use:

```
Bot.on('message', context => {
    let t = context[context.i18nPluginSlug]({
        module: 'wizard'
    });
    context.replyWithHTML(t('your_message', {
        message: context.message.text
    }));
});
```

##### mediaGroup

Group media messages into a single message

```js
Bot.use(mediaGroup({
    timeout: 200,
    types: ['video', 'photo'],
    as: 'gallery'
}));
```

**Usage:**

```js
Bot.on('photo', ctx => {
    console.log(ctx.gallery) = <[photoMessages]>
});
```

##### group

group any messages by type

```js
Bot.use(group({
    timeout: 200,
    types: ['text'],
    as: 'textMessages'
}));
```

#### Helpers

##### createAction(key, slug)

* key - action name
* slug - action slug payload

Each scene must have unique actions! So that after the scene is dismantled, the buttons become inactive (if the events for some scenes are the same, then clicking on the old (previous) buttons will work)

* returns {action, use, get} =  createAction('category', 'fruits')
    - action - string of action
    - use - a function that returns the action string
    - get(context) - will return the value (key and slug) of the selected event

```js
let categories = ['fruits', 'vegetables', 'cars'];
 let buttons = [], actions = [];
for(let category of categories) {
    let action = createAction('category', category.replace(/[^\w\d]+/g, '_'));     
    buttons.push(Markup.button.callback(item, action.action));
    actions.push(action);
}
scene.enter(ctx => ctx.reply('What your choose?', Markup.inlineKeyboard(buttons)))

let {use: useActions, get: getAction} = mergeActions(actions);
 scene.action(useActions(), async ctx => {
    await ctx.answerCbQuery('👍 Nice choose!');
    let [action, slug] =  getAction(ctx);              
    done(ctx, {
        [action]: slug
    });
});
```

##### createActions(items<array>) 

takes an array of objects {key, slug} or strings, and returns results of mergeActions method

```js
let categories = ['fruits', 'vegetables', 'cars'];
let {actions, use: useActions, get: getAction} = createActions(categories);

let buttons = [];
for(let i=0; i<actions.length; i++) {
    buttons.push(Markup.button.callback(categories[i], actions[i].action));
}
scene.enter(ctx => ctx.reply('What your choose?', Markup.inlineKeyboard(buttons)))

scene.action(useActions(), async ctx => {
    await ctx.answerCbQuery('👍 Nice choose!');
    let [action, slug] =  getAction(ctx);              
    done(ctx, {
        [action]: slug
    });
});
```

##### mergeActions(actions<array>) 

combines actions, returns object {actions, use, get}
* actions - array of source actions
* use() - function to create an action key
* get(context) - get key and slug from current context

```js
let {actions, use, get} = createActions(categories);
scene.action(use(), async ctx => {
    await ctx.answerCbQuery('👍 Nice choose!');
    let [action, slug] =  get(ctx);    
});
```

##### sendModifiedMessage, replyToModifiedMessage
**sendModifiedMessage** accepts a method to send a question, returns a wait function to reply to that message by editing the question
```js
sendModifiedMessage(ctx, () => {
    return ctx.replyWithHTML('Choose a action', Markup.inlineKeyboard([
        [Markup.button.callback('Offer', 'offer')],
        [Markup.button.callback('Looking for', 'looking_for')]
    ]))   
});
```

**replyToModifiedMessage**  - reply to a message sent using the **sendModifiedMessage** method (Editing the question)
```js
replyModifiedMessage(ctx, `You answer accepted as: ${action}`);
```

##### sendAnswerMessage, replyToAnswerMessage

**sendAnswerMessage**  -  accepts a method to send a question, returns a wait function to reply to that question
```js
sendAnswerMessage(ctx, () => {
    return ctx.replyWithHTML('Choose a action')
});
```
**replyToAnswerMessage** -  Reply to a message sent using the **sendAnswerMessage** method

```js
replyToAnswerMessage(ctx, () => {
    return ctx.reply('Ok')
});
```

##### confirm, confirmed, confirmReset, hasConfirm
**confirm**(ctx, scene, message, options={})
confirm - create a message that requires confirmation
* **message** - message will be sent as HTML
* **options**  - {extra, confirmText, cancelText, localeName}

**confirmed**(ctx)
    Checks if the request has been confirmed; if not, a new request will be sent.

**confirmReset**(ctx)

**hasConfirm**(ctx)

##### removeEmojis

remove emoji from text
* removeEmojis(str)



```js
let str = removeEmojis("Hello 😁!!!"); // Hello !!!
```
