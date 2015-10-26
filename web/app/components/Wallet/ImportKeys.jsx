import React, {Component, PropTypes} from "react";
import PrivateKey from "ecc/key_private";
import Address from "ecc/address"
import Aes from "ecc/aes";
import alt from "alt-instance"
import connectToStores from "alt/utils/connectToStores"
import cname from "classnames"
import config from "chain/config";
import notify from "actions/NotificationActions";
import hash from "common/hash";

import Apis from "rpc_api/ApiInstances"
import PrivateKeyStore from "stores/PrivateKeyStore"
import WalletUnlockActions from "actions/WalletUnlockActions"
import WalletCreate from "components/Wallet/WalletCreate"
import LoadingIndicator from "components/LoadingIndicator"
import Translate from "react-translate-component";

import BalanceClaimActiveActions from "actions/BalanceClaimActiveActions"
import BalanceClaimAssetTotal from "components/Wallet/BalanceClaimAssetTotal"
import WalletDb from "stores/WalletDb";
import ImportKeysStore from "stores/ImportKeysStore"
import PublicKey from "ecc/key_public";
import AddressIndex from "stores/AddressIndex"

require("./ImportKeys.scss");

var import_keys_assert_checking = false

var TRACE = false

@connectToStores
export default class ImportKeys extends Component {
    
    constructor() {
        super();
        this.state = this._getInitialState();
    }
    
    static getStores() {
        return [ImportKeysStore]
    }
    
    static getPropsFromStores() {
        return {
            importing: ImportKeysStore.getState().importing
        }
    }
    
    _getInitialState() {
        return {
            pubkeys: new Set(),
            keys_to_account: { },
            key_count: 0,
            no_file: true,
            account_keys: [],
            //brainkey: null,
            //encrypted_brainkey: null,
            reset_file_name: Date.now(),
            reset_password: Date.now(),
            password_checksum: null,
            import_password_message: null,
            imported_keys_public: {},
            key_text_message: null,
            genesis_filter_status: [],
            genesis_filter_finished: undefined,
            account_keycount: null
        };
    }
    
    reset(e) {
        console.log("imp reset");
        if(e) e.preventDefault()
        var state = this._getInitialState();
        this.setState(state);
        this.updateOnChange({});
    }
    
    render() {
        // Create wallet prior to the import keys (keeps layout clean)
        if( ! WalletDb.getWallet()) return <WalletCreate hideTitle={true}/>
        
        if( this.props.importing) {
            return <div>
                <h3><Translate content="wallet.import_keys" /></h3>
                <div className="center-content">
                    <LoadingIndicator type="circle"/>
                </div>
            </div>
        }
        
        var was_filtered = this.state.genesis_filter_finished
        var filtering = this.state.genesis_filter_status.length && ! was_filtered
        var account_rows = null
        if(this.state.genesis_filter_status.length) {
            var account_rows = []
            for(let status of this.state.genesis_filter_status) {
                account_rows.push(
                    <tr key={status.account_name}>
                        <td>{status.account_name}</td>
                        <td>{filtering ?
                            <span>Filtering { Math.round( (status.count / status.total) * 100) } % </span>
                            : <span>Keeping {status.count} of {status.total}</span>
                        }</td>
                    </tr>
                )
            }
        }
        
        var has_keys = this.state.key_count !== 0
        var import_ready = has_keys
        // Help show_chain_summary get truthy after filtering (was_filtered),
        // there was a delay until key_count was avalble
        var show_chain_summary = !!this.state.key_count || was_filtered
        var password_placeholder = "Enter import file password";
        if (this.state.key_count) {
            password_placeholder = "";
        }

        if( ! account_rows && this.state.account_keycount) {
            account_rows = [];
            var account_keycount = this.state.account_keycount;
            for (let account_name in account_keycount) {
                account_rows.push(
                    <tr key={account_name}>
                        <td>{account_name}</td>
                        <td>{account_keycount[account_name]}</td>
                    </tr>);
            }
        }
        
        return (
            <div>
                <h3><Translate content="wallet.import_keys" /></h3>
                {/* Key file upload */}
                <div>
                    <span>{this.state.key_text_message ?
                        this.state.key_text_message :
                        <KeyCount key_count={this.state.key_count}/>
                    }</span>
                    {!this.state.key_count ? 
                        null :
                        <span> (<a onClick={this.reset.bind(this)}>reset</a>)</span>
                    }
                </div>
                <br/>
                { ! show_chain_summary && ! filtering ?
                <div>
                    <div className="center-content">
                        <div>
                            <div>
                                <label>BTS 1.0 key export file
                                {this.state.no_file ? null : <span>&nbsp;
                                    (<a onClick={this.reset.bind(this)}>Reset</a>)</span>}
                                </label>
                                <input
                                    type="file" id="file_input"
                                    style={{ border: 'solid' }}
                                    key={this.state.reset_file_name}
                                    onChange={this.upload.bind(this)}
                                />
                            </div>
                            { this.state.no_file ? <span>
                            <br/><br/>
                            <div>
                                <label>Paste Private keys (Wallet Import Format - WIF)</label>
                                <input type="password" onChange={this.onWif.bind(this)} id="wif" />
                            </div>
                            </span>:null}
                        </div>
                        <br/>

                        { ! this.state.no_file ?
                            (<div>
                                <input
                                    type="password" ref="password" autoComplete="off"
                                    key={this.state.reset_password}
                                    placeholder={password_placeholder}
                                    onChange={this._passwordCheck.bind(this)}
                                />
                                <div>{this.state.import_password_message}</div>
                            </div>) : null}
                        <br/>
                        <a href className="button success" onClick={this.onBack.bind(this)}>
                            Done </a>
                    </div>
                </div> : null}

                { account_rows ? 
                <div>
                    { ! account_rows.length ? "No Accounts" :
                    <div>
                        <table className="table center-content">
                            <thead>
                                <tr>
                                    <th style={{textAlign: "center"}}>Account</th>
                                    <th style={{textAlign: "center"}}># of keys</th>
                                </tr>
                            </thead>
                            <tbody>
                                {account_rows}
                            </tbody>
                        </table>
                    </div>}
                </div> : null}
                <br/>
                { show_chain_summary ? 
                <div>
                    <h4 className="center-content">Unclaimed balances belonging to these keys:</h4>
                    <div className="grid-block center-content">
                        <div className="grid-content no-overflow">
                            <label>Asset Totals</label>
                            <BalanceClaimAssetTotal />
                        </div>
                    </div>
                    <br/>

                    <div className="center-content" style={{width: "100%"}}>
                        <div className="button-group content-block">
                            <a href className={cname("button success", {disabled:!import_ready})}
                               onClick={this._saveImport.bind(this)} >
                                Import
                            </a>
                            <a href className="button secondary" onClick={this.reset.bind(this)}>
                                Cancel
                            </a>
                        </div>
                    </div>
                </div> : null}
            </div>
        );
    }
    
    onWif(event) {
        var value = event.target.value
        this.addByPattern(value)
    }
    
    onBack() {
        window.history.back()
    }
    
    updateOnChange(keys_to_account = this.state.keys_to_account) {
        var key_count = Object.keys(keys_to_account).length
        this.setState({key_count})
        this._importKeysChange(keys_to_account)
        BalanceClaimActiveActions.setPubkeys(Object.keys(this.state.imported_keys_public))
    }

    _importKeysChange(keys_to_account) {
        this.setState({
            account_keycount: this.getImportAccountKeyCount(keys_to_account)
        });
    }

    getImportAccountKeyCount(keys_to_account) {
        var account_keycount = {}
        var found = false
        for(let key in keys_to_account)
            for(let account_name of keys_to_account[key].account_names) {
                account_keycount[account_name] =
                    (account_keycount[account_name] || 0) + 1
                found = true
            }
        return found ? account_keycount : null
    }
    
    upload(evt) {
        this.setState({ genesis_filter_status: [] })
        var file = evt.target.files[0]
        var reader = new FileReader()
        reader.onload = evt => {
            var contents = evt.target.result
            try {
                var json_contents
                try {
                    json_contents = JSON.parse(contents)
                    // This is the only chance to encounter a large file, 
                    // try this format first.
                    this._parseImportKeyUpload(json_contents, file.name, update_state => {
                        this.setState(update_state, ()=> {
                            if( update_state.genesis_filter_finished ) {
                                // try empty password, also display "Enter import file password"
                                this._passwordCheck()
                            }
                        })
                    })
                } catch(e) {
                    //DEBUG console.log("... _parseImportKeyUpload",e)
                    try {
                        if( ! json_contents) file.name + " is an unrecognized format"
                        this._parseWalletJson(json_contents)
                    } catch(ee) {
                        if( ! this.addByPattern(contents))
                            throw ee
                    }
                    // try empty password, also display "Enter import file password"
                    this._passwordCheck()
                }
            } catch(message) {
                console.log("... ImportKeys upload error", message)
                this.setState({import_password_message: message})
            }
        }
        reader.readAsText(file);
        this.setState({import_password_message: null, no_file: false});
    }
    
    /** BTS 1.0 client wallet_export_keys format. */
    _parseImportKeyUpload(json_contents, file_name, update_state) {
        var password_checksum, unfiltered_account_keys
        try {
            password_checksum = json_contents.password_checksum
            if( ! password_checksum)
                throw file_name + " is an unrecognized format"
            
            if( ! Array.isArray(json_contents.account_keys))
                throw file_name + " is an unrecognized format"
            
            unfiltered_account_keys = json_contents.account_keys

        } catch(e) { throw e.message || e }
        
        // BTS 1.0 wallets may have a lot of generated but unused keys or spent TITAN addresses making
        // wallets so large it is was not possible to use the JavaScript wallets with them.
        var GenesisFilterWorker = require("worker!workers/GenesisFilterWorker")
        var worker = new GenesisFilterWorker
        var filter_status = this.state.genesis_filter_status
        worker.postMessage({ account_keys: unfiltered_account_keys })
        worker.onmessage = event => { try {
            var { account_keys, status } = event.data
            // missing_public_keys  = un-released format, just for testing
            if( status.error === "missing_public_keys" || status.error === "missing_bloom" ) {
                update_state({ password_checksum, account_keys: unfiltered_account_keys,
                    genesis_filter_finished: true })
                return
            }
            if( status.success ) {
                update_state({ password_checksum, account_keys,
                    genesis_filter_finished: true })
                return
            }
            if( status.initalizing !== undefined ) {
                update_state({ genesis_filter_initalizing: status.initalizing })
                return
            }
            if( status.importing === undefined ) {
                // programmer error
                console.error('unknown status', status)
                return
            }
            
            if( ! filter_status.length )
                // first account
                filter_status.push( status )
            else {
                var last_account_name = filter_status[filter_status.length - 1].account_name
                if( last_account_name === status.account_name )
                    // update same account
                    filter_status[filter_status.length - 1] = status
                else
                    // new account
                    filter_status.push( status )
            }
            update_state({ genesis_filter_status: filter_status })
            
        } catch( e ) { console.error('GenesisFilterWorker', e) }}
    }
    
    /**
    BTS 1.0 hosted wallet backup (wallet.bitshares.org) is supported.
    
    BTS 1.0 native wallets should use wallet_export_keys instead of a wallet backup.
    
    Note,  Native wallet backups will be rejected.  The logic below does not
    capture assigned account names (for unregisted accounts) and does not capture
    signing keys.  The hosted wallet has only registered accounts and no signing
    keys.
    
    */
    _parseWalletJson(json_contents) {
        var password_checksum
        var encrypted_brainkey
        var address_to_enckeys = {}
        var account_addresses = {}
        
        var savePubkeyAccount = function (pubkey, account_name) {
            //replace BTS with GPH
            pubkey = config.address_prefix + pubkey.substring(3)
            var address = PublicKey.fromPublicKeyString(pubkey).toAddressString()
            var addresses = account_addresses[account_name] || []
            address = "BTS" + address.substring(3)
            //DEBUG console.log("... address",address,account_name)
            addresses.push(address)
            account_addresses[account_name] = addresses
        }
        
        try {
            if(! Array.isArray(json_contents)) {
                //DEBUG console.log('... json_contents',json_contents)
                throw new Error("Invalid wallet format")
            }
            for(let element of json_contents) {
                
                if( "key_record_type" == element.type &&
                    element.data.account_address &&
                    element.data.encrypted_private_key
                ) {
                    var address = element.data.account_address
                    var enckeys = address_to_enckeys[address] || []
                    enckeys.push(element.data.encrypted_private_key)
                    //DEBUG console.log("... address",address,enckeys)
                    address_to_enckeys[address] = enckeys
                    continue
                }
                
                if( "account_record_type" == element.type) {
                    var account_name = element.data.name
                    savePubkeyAccount(element.data.owner_key, account_name)
                    for(let history of element.data.active_key_history) {
                        savePubkeyAccount(history[1], account_name)
                    }
                    continue
                }
                
                if ( "property_record_type" == element.type &&
                    "encrypted_brainkey" == element.data.key
                ) {
                    encrypted_brainkey = element.data.value
                    continue
                }
                
                if( "master_key_record_type" == element.type) {
                    if( ! element.data)
                        throw file.name + " invalid master_key_record record"
                    
                    if( ! element.data.checksum)
                        throw file.name + " is missing master_key_record checksum"
                    
                    password_checksum = element.data.checksum
                }
                
            }
            if( ! encrypted_brainkey)
                throw "Please use a BTS 1.0 wallet_export_keys file instead"
            
            if( ! password_checksum)
                throw file.name + " is missing password_checksum"
            
            if( ! enckeys.length)
                throw file.name + " does not contain any private keys"
            
        } catch(e) { throw e.message || e }
        
        var account_keys = []
        for(let account_name in account_addresses) {
            var encrypted_private_keys = []
            for(let address of account_addresses[account_name]) {
                var enckeys = address_to_enckeys[address]
                if( ! enckeys) continue
                for(let enckey of enckeys)
                    encrypted_private_keys.push(enckey)
            }
            account_keys.push({
                account_name,
                encrypted_private_keys
            })
        }
        // We could prompt for this brain key instead on first use.  The user
        // may already have a brainkey at this point so with a single brainkey
        // wallet we can't use it now.
        this.setState({
            password_checksum,
            account_keys
            //encrypted_brainkey
        })
    }
    
    _passwordCheck(evt) {
        var pwNode = React.findDOMNode(this.refs.password)
        if(pwNode) pwNode.focus()
        var password = evt ? evt.target.value : ""
        var checksum = this.state.password_checksum
        this.setState({import_password_message: "Enter import file password"})
        var new_checksum = hash.sha512(hash.sha512(password)).toString("hex")
        if(checksum != new_checksum) {
            if(password != "")
                this.setState({import_password_message: "Enter import file password (keep going)"})
            return
        }
        this.setState({
            reset_password: Date.now(),
            import_password_message: "Password matches. Loading..."
        })
        setTimeout(()=> this._decryptPrivateKeys(password), 250)
    }
    
    _decryptPrivateKeys(password) {
        var password_aes = Aes.fromSeed(password)
        var format_error1_once = true
        for(let account of this.state.account_keys) {
            if(! account.encrypted_private_keys) {
                var error = `Account ${account.account_name} missing encrypted_private_keys`
                console.error(error)
                if(format_error1_once) {
                    notify.error(error)
                    format_error1_once = false
                }
                continue
            }
            var account_name = account.account_name.trim()
            var same_prefix_regex = new RegExp("^" + config.address_prefix)
            for(let i = 0; i < account.encrypted_private_keys.length; i++) {
                let encrypted_private = account.encrypted_private_keys[i]
                let public_key_string = account.public_keys ?
                    account.public_keys[i] : null // performance gain
                
                try {
                    var private_plainhex = password_aes.decryptHex(encrypted_private)
                    if(import_keys_assert_checking && public_key_string) {
                        var private_key = PrivateKey.fromHex( private_plainhex )
                        var pub = private_key.toPublicKey() // S L O W
                        var addy = pub.toAddressString()
                        var pubby = pub.toPublicKeyString()
                        var error = ""

                        let address_string = account.addresses ?
                            account.addresses[i] : null // assert checking
                        
                        if(address_string && addy.substring(3) != address_string.substring(3))
                            error = "address imported " + address_string + " but calculated " + addy + ". "
                        
                        if(pubby.substring(3) != public_key_string.substring(3))
                            error += "public key imported " + public_key_string + " but calculated " + pubby
                        
                        if(error != "")
                            console.log("ERROR Miss-match key",error)
                    }
                    
                    if( ! public_key_string) {
                        var private_key = PrivateKey.fromHex( private_plainhex )
                        var public_key = private_key.toPublicKey()// S L O W
                        public_key_string = public_key.toPublicKeyString()
                    } else {
                        if( ! same_prefix_regex.test(public_key_string))
                            // This was creating a unresponsive chrome browser 
                            // but after the results were shown.  It was probably  
                            // caused by garbage collection.
                            public_key_string = config.address_prefix +
                                public_key_string.substring(3)
                    }
                    this.state.imported_keys_public[public_key_string] = true
                    var {account_names} = this.state.keys_to_account[private_plainhex] || 
                        {account_names: []}
                    var dup = false
                    for(let _name of account_names)
                        if(_name == account_name)
                            dup = true
                    if(dup) continue
                    account_names.push(account_name)
                    this.state.keys_to_account[private_plainhex] = {account_names, public_key_string}
                } catch(e) {
                    console.log(e, e.stack)
                    var message = e.message || e
                    notify.error(`Account ${account_name} had a private key import error: `+message)
                }
            }
        }
        //var enc_brainkey = this.state.encrypted_brainkey
        //if(enc_brainkey){
        //    this.setState({
        //        brainkey: password_aes.decryptHexToText(enc_brainkey)
        //    })
        //}
        this.updateOnChange()
        this.setState({
            import_password_message: null,
            password_checksum: null
        })
        //})
    }

    _saveImport(e) {
        e.preventDefault()
        var keys = PrivateKeyStore.getState().keys
        for(let public_key_string in this.state.imported_keys_public) {
            if(keys.get(public_key_string)) {
                notify.error("This wallet has already been imported")
                return
            }
        }
        WalletUnlockActions.unlock().then(()=> {
            ImportKeysStore.importing(true)
            // show the loading indicator
            setTimeout(()=> this.saveImport(), 200)
        })
    }
    
    saveImport() {
        // Lookup and add accounts referenced by the keys
        // var imported_keys_public = this.state.imported_keys_public
        // var db = Apis.instance().db_api()
        
        if(TRACE) console.log('... ImportKeys._saveImport START')
        
        var keys_to_account = this.state.keys_to_account
        var private_key_objs = []
        for(let private_plainhex of Object.keys(keys_to_account)) {
            var {account_names, public_key_string} = keys_to_account[private_plainhex]
            private_key_objs.push({
                private_plainhex,
                import_account_names: account_names,
                public_key_string
            })
        }
        this.reset()
        WalletDb.importKeysWorker( private_key_objs ).then( result => {
            ImportKeysStore.importing(false)
            var import_count = private_key_objs.length
            notify.success(`Successfully imported ${import_count} keys.`)
            this.onBack() // back to claim balances
        }).catch( error => {
            console.log("error:", error)
            ImportKeysStore.importing(false)
            var message = error
            try { message = error.target.error.message } catch (e){}
            notify.error(`Key import error: ${message}`)
        })
    }

    addByPattern(contents) {
        if( ! contents)
            return false
        
        var count = 0, invalid_count = 0
        var wif_regex = /5[HJK][1-9A-Za-z]{49}/g
        for(let wif of contents.match(wif_regex) || [] ) {
            try { 
                var private_key = PrivateKey.fromWif(wif) //could throw and error 
                var private_plainhex = private_key.toBuffer().toString('hex')
                var public_key = private_key.toPublicKey() // S L O W
                var public_key_string = public_key.toPublicKeyString()
                this.state.imported_keys_public[public_key_string] = true
                this.state.keys_to_account[private_plainhex] = {
                    account_names: [], public_key_string}
                count++
            } catch(e) { invalid_count++ }
        }
        this.updateOnChange()
        this.setState({
            imported_keys_public: this.state.imported_keys_public,
            keys_to_account: this.state.keys_to_account,
            key_text_message: 'Found ' +
                (!count ? "" : count + " valid") +
                (!invalid_count ? "" : " and " + invalid_count + " invalid") + 
                " key" + ( count > 1 || invalid_count > 1 ? "s" : "") + "."
        })
        this.state.key_text_message = null
        return count
    }

}

class KeyCount extends Component {
    render() {
        if( !this.props.key_count) return <span/>
        return <span>Found {this.props.key_count} private keys</span>
    }
}

