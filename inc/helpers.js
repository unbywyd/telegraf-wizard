
function parseAction(context) {
    let [key, value] = [context.match[0].split('#')[1] ? context.match[0].split('#')[1] : '', context.match[0].split('#')[2] ? context.match[0].split('#')[2] : ''];
    
    if(value === 'true') {
        value = true;
    }
    if(value === 'false') {
        return false;
    }
    if(/^\d$/.test(value)) {
        return parseInt(value);
    }
    if(/^\d*\.\d+$/.test(value)) {
        return parseFloat(value);
    }
    return [key, value];
}
module.exports.parseAction = parseAction

function mergeActions(actions) {
    return {
        actions,
        use() {
            return actions.map(e=> e.action)
        },
        get: parseAction
    }
}
module.exports.mergeActions = mergeActions;

function createActions(items) {
    let actions = [];
    for(let item of items) {
        let key, slug;
        if('object' == typeof item) {
            key = item.key;
            slug = item.slug;
        } else {
            key = item;
            slug = 'true';
        }
        actions.push(createAction(key, slug));
    }
    return mergeActions(actions);
}
module.exports.createActions =  createActions;

function createAction(key, slug = 'true') {
    let id = Math.random().toString(36).substr(2, 9);
    let action = id + '#' +  key.replace(/\s+/g, '_').toLowerCase();
    action += '#' + slug.toString().replace(/\s+/g, '_').toLowerCase();
    return {
        action,
        use() {
            return action
        },
        get: parseAction
    }
}
module.exports.createAction = createAction;
/*
*   Accepts a method to send a question, returns a wait function to reply to that message by editing the question
*   sendModifiedMessage(ctx, () => {
*       return ctx.replyWithHTML(t('choose_action_message'), Markup.inlineKeyboard([
*          [Markup.button.callback('Offer', 'offer')],
*           [Markup.button.callback('Looking for', 'looking_for')]
*       ]))   
*  });
*/
function sendModifiedMessage(ctx, method) {
    return ctx.session.sendModifiedMessage = (async function() {
        let message_obj = {}
        try {
            message_obj = await method();
        } catch(e) {
            console.log(e);
        }
        return function(message, extra={}) {
            return ctx.telegram.editMessageText(ctx.chat.id, message_obj.message_id, false, message, Object.assign({
                parse_mode: 'html'    
            }, extra)).catch(e => {
                console.log(e);
            });
        }
    })();
}
module.exports.sendModifiedMessage = sendModifiedMessage;
/*
*   Reply to a message sent using the sendModifiedMessage method (will edit the question)
*   replyModifiedMessage(ctx, `You answer accepted as: ${answer}`);
*/

function replyToModifiedMessage(ctx, ...args) {
    if(ctx.session.sendModifiedMessage) {        
        return ctx.session.sendModifiedMessage.then(async (callback) => {
            return callback(...args);
        }).catch(e => {
            console.log(e);
        });
    }
    return Promise.resolve({});
}
module.exports.replyToModifiedMessage = replyToModifiedMessage;


/*
*   Accepts a method to send a question, returns a wait function to reply to that question
*/
function sendAnswerMessage(ctx, method) {   
    if('function' != typeof method) {
        throw new Error('Method must be a function');
    }
    return ctx.session.sendAnswerMessage = (async function() {
        let message_obj = {}
        try {
            message_obj = await method();
        } catch(e) {
            console.log(e);
        }
        return function(message, extra={}) {
            return ctx.telegram.sendMessage(ctx.chat.id, message, Object.assign({
                parse_mode: 'html',
                reply_to_message_id: message_obj.message_id
            }, extra)).catch(e => {
                console.log(e);
            });
        }
    })();
}
module.exports.sendAnswerMessage = sendAnswerMessage;

/*
*    Reply to a message sent using the sendAnswerMessage method
*/
function replyToAnswerMessage(ctx, ...args) {
    if(ctx.session.sendAnswerMessage) {        
        return ctx.session.sendAnswerMessage.then(async (callback) => {
            return callback(...args);
        }).catch(e => {
            console.log(e);
        });
    }
    return Promise.resolve({});
}    

module.exports.replyToAnswerMessage = replyToAnswerMessage;

/*
*   Sends a message that requires confirmation or rejection
*/
async function confirm(ctx, scene, message, options={}) {
    ctx.session.confirmBox = (function() {
        let t = i18n(ctx, {
            module: options.localeName || 'wizard'
        });
        let {extra, confirmText, cancelText} = options;
        let id = '_' + Math.random().toString(36).substr(2, 9);
        if(!confirmText) {
            confirmText = t('confirm_btn_label')
        }
        if(!cancelText) {
            cancelText = t('cancel_btn_label')
        }
        if(!extra) {
            extra = {}
        }
        extra = Object.assign(extra, {
            ...Markup.inlineKeyboard([
                Markup.button.callback(confirmText, 'confirm' + id),
                Markup.button.callback(cancelText, 'cancel' + id)
            ])
        });

        let request = (ctx) => {
            return ctx.replyWithHTML(message, extra)
        }        
        return {
            request,
            response: new Promise((res, rej) => {
                scene.action('confirm' + id, async (ctx, next) => {
                    if(!ctx.session.confirmBox) {
                        return next();
                    }    
                    try {
                        await ctx.answerCbQuery('👍');
                        await ctx.deleteMessage();
                    } catch(e) {
                    }
                    delete ctx.session.confirmBox;
                    res(true);
                });
                scene.action('cancel' + id, async (ctx, next) => {          
                    if(!ctx.session.confirmBox) {
                        return next();
                    }     
                    try {
                        await ctx.answerCbQuery('👍');
                        await ctx.deleteMessage();
                    } catch(e) {
                    }
                    delete ctx.session.confirmBox;
                    res(false);
                });
            })
        }
    })();
    await ctx.session.confirmBox.request(ctx);
    return ctx.session.confirmBox.response
}    
module.exports.confirm = confirm;
/*
*   Check if the user has confirmed the message, if not then send a new request (message)
*/
async function confirmed(ctx) {
    if(!ctx.session.confirmBox) {
        return true;
    }
    try {
        await ctx.session.confirmBox.request(ctx);
    } catch(e) {
        console.log(e);
    }
    return false;
}    
module.exports.confirmed = confirmed
/*
*   Reset confirm
*/

function confirmReset(ctx) {
    delete ctx.session.confirmBox
}   
module.exports.confirmReset = confirmReset

/*
*   Check if comnfirm was sent
*/
function hasConfirm(ctx) {
    return !!ctx.session.confirmBox
}    
module.exports.hasConfirm = hasConfirm
/*
*   Remove all smiles from text
*/
function removeEmojis(str) {
    var regex = /(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|\ud83c[\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|\ud83c[\ude32-\ude3a]|\ud83c[\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c\udc04|[\u2600-\u26FF]|\u2b05|\u2b06|\u2b07|\u2b1b|\u2b1c|\u2b50|\u2b55|\u231a|\u231b|\u2328|\u23cf|[\u23e9-\u23f3]|[\u23f8-\u23fa]|\ud83c\udccf|\u2934|\u2935|[\u2190-\u21ff])/g;
    return str.replace(regex, '');
}
module.exports.removeEmojis = removeEmojis