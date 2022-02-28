const yaml = require('yaml'), fs = require('fs'), path = require('path');
const Handlebars = require('handlebars');

/*
*   Creating a Middleware plugin
*/
function i18n(options={}) {
    this.options = {...{    
        useUserLanguage : true,
        defaultLanguage:  'en',
        dirLanguagesPath: './languages',
        slug: 'i18n',
        updateClientLanguage: async (ctx, lang) => lang
    }, ...options};
    let {dirLanguagesPath} = this.options;   
    this.pathToLanguages = path.join(process.cwd(), dirLanguagesPath);
    if(!fs.existsSync(this.pathToLanguages)) {
        throw new Error(this.pathToLanguages + " path to dir languages not exist");
    }
    let files = fs.readdirSync(this.pathToLanguages);
    this.modules = {}

    // Loaded all languages
    if(files.length) {
        for (let fileName of files) {
            if (path.extname(fileName).toLowerCase() == '.yaml') {
                try {
                    this.modules[path.basename(fileName, path.extname(fileName))] = yaml.parse(fs.readFileSync(path.join(this.pathToLanguages, fileName), 'UTF-8'));
                } catch(e) {
                    console.log(fileName, e);
                }
            }
        }
    }
    // Call plugin on new occurrence
    return async (ctx, next) => {
        
        let from = ctx.from || ctx.senderChat;      
        
        let userLanguage = from.language_code || this.options.defaultLanguage;
        if(!ctx.session) {
            ctx.session = {}
        }
        ctx.i18nPluginSlug = this.options.slug;

        if(this.options.useUserLanguage && !from.language_code && ctx.session.i18nLanguage) {
            userLanguage = ctx.session.i18nLanguage;
        }

        let languageCode = this.options.useUserLanguage ?  userLanguage : this.options.defaultLanguage;

        if(!languageCode) {
            languageCode = 'en';
        }
        languageCode = ctx.session.i18nLanguage ? ctx.session.i18nLanguage : languageCode; // Got language from session 
        if(!ctx.session.i18nLanguage) {
            ctx.session.i18nLanguage = languageCode;
        }
       
        /*
        *   Updated the user language using the updateClientLanguage callback
        */
        languageCode = await this.options.updateClientLanguage(ctx, languageCode); 
        ctx.session.i18nLanguage = languageCode;

        ctx[this.options.slug] = this.subscribe(ctx, languageCode); // Place the installed plugin
        return next();
    }
}
i18n.prototype.setDefaultLanguage = function(lang) {
    this.options.defaultLanguage = lang;
}
i18n.prototype.subscribe = function(ctx, languageCode) {
    return (options={}) => {
        let moduleName = options.module ? options.module : 'common';
        if(options.languageCode) { // Change profile language
            languageCode = options.languageCode;
            ctx.session.i18nLanguage = languageCode; // Updated profile language
        }
        
        let langs = this.modules[moduleName];
        
        return (str, context={}) => {
            if(!langs || langs && !langs[str]) {
                return str
            } else {
                let sourceStr = langs[str][languageCode] ? langs[str][languageCode] : (langs[str][this.options.defaultLanguage] || str);
                if(/^#/.test(sourceStr)) {
                    let pathToFile = path.join(this.pathToLanguages, sourceStr.replace('#', ''));
                    if(fs.existsSync(pathToFile)) {
                        sourceStr = fs.readFileSync(pathToFile, 'UTF-8');
                    }
                }
                let template = Handlebars.compile(sourceStr);               
                return template(context);
            }
        }
    }      
}

module.exports = function(options={}) {
    return new i18n(options);
}