/* global api, hash */
class EncOxford {
    constructor(options) {
        this.token = '';
        this.gtk = '';
        this.options = options;
        this.maxexample = options.maxexample || 2;
        this.word = '';
    }

    async displayName() {
        return 'Oxford EN->EN Dictionary';
    }

    setOptions(options) {
        this.options = options;
        this.maxexample = options.maxexample || 2;
    }

    // Get token and gtk from Baidu homepage
    async getToken() {
        let homeurl = 'https://fanyi.baidu.com/';
        let homepage = await api.fetch(homeurl);
        let tmatch = /token: '(.+?)'/gi.exec(homepage);
        let gmatch = /window.gtk = '(.+?)'/gi.exec(homepage);

        if (!tmatch || !gmatch) return null;

        return {
            token: tmatch[1],
            gtk: gmatch[1]
        };
    }

    // Main method to find word and retrieve definitions
    async findTerm(word) {
        this.word = word;
        let deflection = await api.deinflect(word) || [];
        let promises = [word, ...deflection].map(x => this.findOxford(x));
        let results = await Promise.all(promises);
        return [].concat(...results).filter(x => x);
    }

    // Retrieve Oxford definitions for the word
    async findOxford(word) {
        if (!word) return [];

        // Get token and gtk if not already set
        if (!this.token || !this.gtk) {
            let common = await this.getToken();
            if (!common) return [];
            this.token = common.token;
            this.gtk = common.gtk;
        }

        let sign = hash(word, this.gtk);
        if (!sign) return [];

        let dicturl = `https://fanyi.baidu.com/v2transapi?from=en&to=zh&simple_means_flag=3&query=${word}&sign=${sign}&token=${this.token}`;
        let data = '';

        try {
            data = JSON.parse(await api.fetch(dicturl));
            let oxford = this.getOxford(data);
            let bdsimple = oxford.length ? [] : this.getBDSimple(data); // Combine Youdao Concise English-Chinese Dictionary
            let bstrans = oxford.length || bdsimple.length ? [] : this.getBDTrans(data); // Youdao Translation if no Oxford results
            return [].concat(oxford, bdsimple, bstrans);
        } catch (err) {
            console.error("Error fetching data:", err);
            return [];
        }
    }

    // Get definitions from the Oxford part of the data
    getOxford(data) {
        try {
            let simple = data.dict_result.simple_means;
            let expression = simple.word_name;
            if (!expression) return [];

            let symbols = simple.symbols[0];
            let reading_uk = symbols.ph_en || '';
            let reading_us = symbols.ph_am || '';
            let reading = reading_uk && reading_us ? `uk[${reading_uk}] us[${reading_us}]` : '';

            let audios = [
                `https://fanyi.baidu.com/gettts?lan=uk&text=${encodeURIComponent(expression)}&spd=3&source=web`,
                `https://fanyi.baidu.com/gettts?lan=en&text=${encodeURIComponent(expression)}&spd=3&source=web`
            ];

            let definitions = [];
            let entries = data.dict_result.oxford.entry[0].data;
            if (!entries) return [];

            entries.forEach(entry => {
                let definition = '';
                entry.data.forEach(group => {
                    if (group.tag === 'p') {
                        definition = `<span class="pos">${group.p_text}</span>`;
                    }
                    if (group.tag === 'd') {
                        definition += `<span class="tran"><span class="eng_tran">${group.enText}</span></span>`;
                        definitions.push(definition);
                    }
                    if (group.tag === 'n-g') {
                        definitions.push(this.buildDefinitionBlock(group.data));
                    }
                });
            });

            let css = EncOxford.renderCSS();
            return [{ css, expression, reading, definitions, audios }];
        } catch (error) {
            console.error("Error processing Oxford data:", error);
            return [];
        }
    }

    // Build definition block for Oxford dictionary
    buildDefinitionBlock(defs) {
        let sentence = '';
        let sentnum = 0;
        let defText = '';
        defs.forEach(def => {
            if (def.text) defText += `<span class='tran'><span class='eng_tran'>${def.text}</span></span>`;
            if (def.tag === 'x' && sentnum < this.maxexample) {
                sentnum += 1;
                let enText = def.enText.replace(RegExp(this.word, 'gi'), `<b>${this.word}</b>`);
                sentence += `<li class='sent'><span class='eng_sent'>${enText}</span></li>`;
            }
        });

        return defText + (sentence ? `<ul class="sents">${sentence}</ul>` : '');
    }

    // Get translations from Baidu
    getBDTrans(data) {
        if (!data.trans_result || data.trans_result.data.length < 1) return [];
        let expression = data.trans_result.data[0].src;
        let definition = data.trans_result.data[0].dst;
        return [{
            css: '<style>.odh-expression {font-size: 1em!important;font-weight: normal!important;}</style>',
            expression,
            definitions: [definition]
        }];
    }

    // Get simplified definitions from Baidu
    getBDSimple(data) {
        let simple = data.dict_result.simple_means;
        let expression = simple.word_name;
        if (!expression) return [];

        let symbols = simple.symbols[0];
        let reading_uk = symbols.ph_en || '';
        let reading_us = symbols.ph_am || '';
        let reading = reading_uk && reading_us ? `uk[${reading_uk}] us[${reading_us}]` : '';

        let audios = [
            `http://fanyi.baidu.com/gettts?lan=uk&text=${encodeURIComponent(expression)}&spd=3&source=web`,
            `http://fanyi.baidu.com/gettts?lan=en&text=${encodeURIComponent(expression)}&spd=3&source=web`
        ];

        let definition = '<ul class="ec">';
        symbols.parts.forEach(part => {
            if (part.means) {
                let pos = part.part || '';
                pos = pos ? `<span class="pos simple">${pos}</span>` : '';
                definition += `<li class="ec">${pos}<span class="ec_chn">${part.means.join()}</span></li>`;
            }
        });
        definition += '</ul>';

        let css = `<style>ul.ec, li.ec {margin:0; padding:0;}</style>`;
        return [{ css, expression, reading, definitions: [definition], audios }];
    }

    // Render CSS for styling the definitions
    static renderCSS() {
        return `
            <style>
                div.dis {font-weight: bold;margin-bottom:3px;padding:0;}
                span.grammar, span.informal {color: #0d47a1;}
                span.pos {font-size:0.9em;margin-right:5px;padding:2px 4px;color:white;background-color:#0d47a1;border-radius:3px;}
                span.tran {padding:0;}
                span.eng_tran {padding-right:5px;}
                ul.sents {font-size:0.9em;margin:3px 0;padding:5px;background:rgba(13,71,161,0.1);border-radius:5px;}
                li.sent {margin:0;padding:0;}
                span.eng_sent {padding-right:5px;}
            </style>`;
    }
}
