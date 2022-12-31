import firebaseConfig from '/firebase/config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js';
import { getAuth, signInWithRedirect, onAuthStateChanged, signOut, 
    GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import { getDatabase, ref, push, update, onValue, set, get, remove } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

class MyApp extends HTMLElement {
    constructor() {
        super();
        this.shadowDOM = this.attachShadow({mode: 'open'});
        this.user = 'loading';
    }

    connectedCallback() {
        onAuthStateChanged(auth, user => {
            this.user = user;
            this.render();

            if (!user) this.initAnon();
            else this.initUser();
        });
        this.render();
    }

    render() {
        let $view = 'Loading ...';

        if (!this.user) $view = this.templateAnon();
        else $view = this.templateUser();
        this.shadowDOM.innerHTML = /*html*/`
            <link rel="stylesheet" href="/style.css">
            ${ $view }
        `;
    }

    templateAnon() {
        return /*html*/`
            <div>
                <h3>Notes with</h3>
                <p><button>Google</button></p>
            </div>
        `;
    }

    templateUser() {
        return /*html*/`
            <div>${ this.user.displayName || '' }
                <button id="new">New</button>
                <button id="logout">Logout</button>
            </div>
            <div class="view">
                <div id="paths"></div><div id="content"></div>
            </div>
            <div id="tool" style="display: none;">
                <div>
                    <input type="text" value="320" id="tool-width"> x 
                    <input type="text" value="180" id="tool-height">
                    <button id="tool-pencil">&nbsp;</button>
                    <button id="tool-eraser">&nbsp;</button>
                    <button id="tool-ok">Ok</button>
                    <button id="tool-close">X</button>
                </div>
                <canvas width="320" height="180"></canvas>
            </div>
        `;
    }

    initAnon() {
        this.shadowDOM
            .querySelectorAll('button')
            .forEach(btn => 
                btn.addEventListener('click', this.onLogin.bind(this)));
    }

    initUser() {
        this.base = `/notes/${ this.user.uid}/`;
        this.$paths = this.shadowDOM.querySelector('#paths');
        this.$content = this.shadowDOM.querySelector('#content');
        this.$tool = this.shadowDOM.querySelector('#tool');
        this.$canvas = this.shadowDOM.querySelector('canvas');
        this.shadowDOM
            .querySelector('#logout')
            .addEventListener('click', _ => signOut());
        this.shadowDOM
            .querySelector('#new')
            .addEventListener('click', this.onNew.bind(this));
        this.shadowDOM
            .querySelector('#tool-close')
            .addEventListener('click', _ => this.$tool.style.display = 'none');
        this.shadowDOM
            .querySelector('#tool-width')
            .addEventListener('keyup', evt => this.$canvas.setAttribute('width', evt.target.value));
        this.shadowDOM
            .querySelector('#tool-height')
            .addEventListener('keyup', evt => this.$canvas.setAttribute('height', evt.target.value));
        this.shadowDOM
            .querySelector('#tool-ok')
            .addEventListener('click', _ => {
                this.$content.querySelector('pre').innerHTML += `<img src="${ this.$canvas.toDataURL() }">`;
                this.$tool.style.display = 'none';
            });
        this.shadowDOM
            .querySelector('#tool-pencil')
            .addEventListener('click', _ => this.$canvas.setAttribute('data', 'rgb(91, 70, 54)'));
        this.shadowDOM
            .querySelector('#tool-eraser')
            .addEventListener('click', _ => this.$canvas.removeAttribute('data'));

        this.$canvas.addEventListener('mousedown', evt => evt.target.over = true);
        this.$canvas.addEventListener('mouseup', evt => evt.target.over = false);
        this.$canvas.addEventListener('mousemove', this.onDraw.bind(this));

        this.$canvas.addEventListener('touchstart', evt => evt.target.over = true);
        this.$canvas.addEventListener('touchend', evt => evt.target.over = false);
        this.$canvas.addEventListener('touchmove', this.onDraw.bind(this));

        onValue(ref(database, this.base + 'path/'), raw => {
            this.notes = raw.val();
            if (!this.notes) return;
            let $paths = Object.keys(this.notes).map(key => {
                return /*html*/`
                    <div data="${ key }">» ${ this.notes[key].path }</div>
                `;
            });
            this.$paths.innerHTML = $paths.join('\n');
            this.$paths
                .querySelectorAll('div')
                .forEach(btn => 
                    btn.addEventListener('click', evt => {
                        this.current = evt.target.getAttribute('data');
                        this.onEdit();
                    }));
        });
    }

    onLogin(evt) {
        switch (evt.target.innerHTML) {
            case 'Google': signInWithRedirect(auth, new GoogleAuthProvider()); break;
        }
    }

    onNew() {
        let key = push(ref(database, this.base + 'path/')).key;
        this.current = key;
        update(ref(database, this.base + 'path/' + key), {
            path: 'note', modified: Date.now()
        }).then(_ => this.onEdit());
    }

    onEdit() {
        let note = this.notes[this.current];
        this.$content.innerHTML = /*html*/`
            <div class="right">
                <button id="content-delete">DELETE</button>
                <button id="content-img">IMG</button>
                <button id="content-save">SAVE</button>
            </div>
            <pre contentEditable>${ note.path }<br></pre>
        `;
        get(ref(database, this.base + 'content/' + this.current))
            .then(raw => this.$content.querySelector('pre').innerHTML += raw.val() || '');
        this.$content
            .querySelector('#content-delete')
            .addEventListener('click', this.onDelete.bind(this));
        this.$content
            .querySelector('#content-save')
            .addEventListener('click', this.onSave.bind(this));
        this.$content
            .querySelector('#content-img')
            .addEventListener('click', _ => {
                this.$canvas.setAttribute('data', 'rgb(91, 70, 54)');
                this.$canvas.getContext('2d').clearRect(0, 0,
                    this.$canvas.width,
                    this.$canvas.height
                );
                this.$tool.style.display = '';
            });
    }

    onSave() {
        let $content = this.$content.querySelector('pre').innerHTML;
        let path = $content.slice(0, $content.indexOf('<br>'));
        let content = $content.slice(path.length + 4);
        update(ref(database, this.base + 'path/' + this.current), {
            path: path, modified: Date.now()
        });
        set(ref(database, this.base + 'content/' + this.current), content);
    }

    onDelete() {
        remove(ref(database, this.base + 'path/' + this.current));
        remove(ref(database, this.base + 'content/' + this.current));
        this.$paths.innerHTML = '';
        this.$content.innerHTML = '';
    }

    onDraw(evt) {
        if (!evt.target.over) return;
        let rect = evt.target.getBoundingClientRect();
        let ctx = evt.target.getContext('2d');
        if (evt.target.getAttribute('data')) {
            ctx.fillStyle = evt.target.getAttribute('data');
            ctx.fillRect(
                evt.clientX - rect.left,
                evt.clientY - rect.top,
                3, 3
            );
        } else ctx.clearRect(
            evt.clientX - rect.left,
            evt.clientY - rect.top,
            5, 5
        );
    }
}

window.customElements.define('my-app', MyApp);
