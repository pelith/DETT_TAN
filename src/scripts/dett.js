import { NETWORK, TOKEN, ABI, CONTRACT } from './constant'
import {awaitTx, parseText} from './utils'

const NETWORKID = NETWORK.MAINNET
const FROMBLOCK = '4512246'
const titleLength = 40
const commentLength = 56
const perPageLength = 20

let rWeb3 = null
let rWeb3Provider = null
let BBSPB = null

class EventEmitter{
  constructor(){
    this._events={}
  }
  on(event,callback){
    let callbacks = this._events[event] || []
    callbacks.push(callback)
    this._events[event] = callbacks
    return this
  }
  off(event,callback){
    let callbacks = this._events[event]
    this._events[event] = callbacks && callbacks.filter(fn => fn !== callback)
    return this
  }
  emit(...args){
    const event = args[0]
    const params = [].slice.call(args,1)
    const callbacks = this._events[event]
    if (callbacks) {
      callbacks.forEach(fn => fn.apply(this, params))
    }
    return this
  }
  once(event,callback){
    let wrapFunc = (...args) => {
      callback.apply(this,args)
      this.off(event,wrapFunc)
    }
    this.on(event,wrapFunc)
    return this
  }
}

class PostBase {
  static getAuthorMeta(address) {
    const addr = address.toLowerCase()
    const cache = PostBase._metaCache
    if (cache.has(addr)) {
      return cache.get(addr)
    }

    const promise = BBSPB.methods.getPlayer(address).call()
    .then(data => ({
      name: rWeb3.utils.hexToUtf8(data[0]),
      names: +data[1],
      exp: +data[2],
      referrer: data[3],
      link: data[4],
      meta: data[5],
    }))
    cache.set(addr, promise)
    return promise
  }
}
// static property that is shared between articles/comments
PostBase._metaCache = new Map()

class Article extends PostBase {
  constructor(_transaction) {
    super()

    this.transaction = _transaction
    // this.rawContent = rWeb3.utils.hexToUtf8('0x' + this.transaction.input.slice(138))
    this.titleMatch = false

    this.editTimestamps = []
  }

  async init(event) {
    this.block = await rWeb3.eth.getBlock(this.transaction.blockNumber)
    this.author = event[0].returnValues.author
    this.rawContent  = event[0].returnValues.content
    this.authorMeta = await Article.getAuthorMeta(this.author)
    this.timestamp = this.block.timestamp   
    this.title = this.getTitle()
    this.content = this.getContent()   
  }

  async initEdits(edits) {
    for ( let edit of edits ){
      if (edit.returnValues.author === this.author) {
        this.rawContent = edit.returnValues.content
        this.title = this.getTitle()
        this.content = this.getContent()
        const block = await rWeb3.eth.getBlock(edit.blockNumber)
        this.editTimestamps.push(block.timestamp)
      }
    }
  }

  getTitle(){
    // title format : [$title]
    let content = this.rawContent
    content = parseText(content, this.titleLength+'[]'.length)
    const match = content.match(/^\[(.*)\]/)
    this.titleMatch = !!match
    return match ? match[1] : content
  }

  getContent(){
    return this.titleMatch ? this.rawContent.slice(this.title.length+'[]'.length) : this.rawContent
  }
}

class Comment extends PostBase {
  constructor(event) {
    super()
    this.tx = event.transactionHash
    this.author = event.returnValues.author
    this.blockNumber = event.blockNumber
    this.rawContent = event.returnValues.content
    this.content = this.getContent()
    this.vote = +event.returnValues.vote
  }

  async init() {
    const [block, authorMeta] = await Promise.all([
      rWeb3.eth.getBlock(this.blockNumber),
      Comment.getAuthorMeta(this.author),
    ])

    this.block = block
    this.timestamp = this.block.timestamp
    this.authorMeta = authorMeta
  }

  getContent() {
    return parseText(this.rawContent, this.commentLength)
  }
}

class Dett extends EventEmitter {
  constructor() {
    super()
    this._account = ''
    this.lock = false

    // constant
    this.commentLength = commentLength
    this.titleLength = titleLength
    this.perPageLength = perPageLength
  }

  get account() {
    return this._account
  }

  set account(_account) {
    this._account = _account
    this.emit('account', _account)
  }

  initRWeb3Provider(rWeb3Provider) {
    this.rWeb3Provider = rWeb3Provider
    this.rWeb3 = rWeb3Provider.library

    this.BBS = new this.rWeb3.eth.Contract(ABI.BBS, CONTRACT[NETWORKID].BBS) 
    this.BBSAdmin = new this.rWeb3.eth.Contract(ABI.ADMIN, CONTRACT[NETWORKID].ADMIN)
    this.BBSPB = new this.rWeb3.eth.Contract(ABI.PLAYERBOOK, CONTRACT[NETWORKID].PLAYERBOOK)
    this.BBSCache = new this.rWeb3.eth.Contract(ABI.SHORTLINK, CONTRACT[NETWORKID].SHORTLINK)

    rWeb3 = this.rWeb3
    BBSPB = this.BBSPB
    rWeb3Provider = this.rWeb3Provider
  }

  initWWeb3Provider(wWeb3Provider) {
    this.wWeb3Provider = wWeb3Provider
    this.wWeb3 = wWeb3Provider.library

    this.dettBBS = new this.wWeb3.eth.Contract(ABI.BBS, CONTRACT[NETWORKID].BBS)
    this.dettBBSPB = new this.wWeb3.eth.Contract(ABI.PLAYERBOOK, CONTRACT[NETWORKID].PLAYERBOOK)
  }

  initCacheWeb3Provider(wWeb3Provider) {
    this.cWeb3Provider = wWeb3Provider
    this.cWeb3 = wWeb3Provider.library

    this.BBS = new this.cWeb3.eth.Contract(ABI.BBS, CONTRACT[NETWORKID].BBS)
    this.BBSPB = new this.cWeb3.eth.Contract(ABI.PLAYERBOOK, CONTRACT[NETWORKID].PLAYERBOOK)
    this.BBSCache = new this.cWeb3.eth.Contract(ABI.SHORTLINK, CONTRACT[NETWORKID].SHORTLINK)
  }

  loadPageCache(_page) {
    const url = window.location.origin
    return fetch(`${url}/p/${_page}.json`, { method: 'get' }).then(res => {
      return res.json()
    }).then((jsonData) => {
      return jsonData
    }).catch((error) => {
      return false
    })
  }

  async getCachedArticles(cacheData) {
    if (!cacheData) return await this.getArticles()

    const articles = await cacheData.map(async (transactionHash) => {
      const [article, votes, banned] = await Promise.all([
        this.getArticle(transactionHash, null, false),
        this.getVotes(transactionHash),
        this.getBanned(transactionHash),
      ])

      return [article, votes, banned]
    })

    return articles
  }

  async getNewArticles(articleHash) {
    const transaction = await rWeb3.eth.getTransaction(articleHash)
    console.log(+transaction.blockNumber+1)
    return await this.getArticles({ fromBlock: +transaction.blockNumber+1+'' })
  }

  async getArticles({fromBlock = null, toBlock = null} = {}){
    const _fromBlock = fromBlock ? fromBlock.split('-')[0] : FROMBLOCK
    const _toBlock = toBlock ? toBlock.split('-')[0] : 'latest'

    this.BBSEvents = await this.BBS.getPastEvents('Posted', {fromBlock : _fromBlock, toBlock: _toBlock})

    if (fromBlock)
      this.BBSEvents.splice(0, (+fromBlock.split('-')[1]) + 1)

    if (toBlock)
      this.BBSEvents.splice(perPageLength, this.BBSEvents.length - perPageLength)

    return this.BBSEvents.map(async (event) => {
      const [article, votes, banned] = await Promise.all([
        this.getArticle(event.transactionHash, false),
        this.getVotes(event.transactionHash),
        this.getBanned(event.transactionHash),
      ])

      return [article, votes, banned]
    })
  }

  async getArticle(tx, checkEdited){
    const transaction = await this.rWeb3.eth.getTransaction(tx)

    const events = await this.BBS.getPastEvents('Posted', {fromBlock : transaction.blockNumber, toBlock: transaction.blockNumber})
    const event = events.filter(event => event.transactionHash === transaction.hash)

    // check transaction to address is bbs contract
    if (event.length !== 1) 
      return null

    const article = new Article(transaction)
    await article.init(event)

    if (checkEdited) {
      const BBSEditEvents = await this.BBS.getPastEvents('Edited', {fromBlock : FROMBLOCK})
      const edits = BBSEditEvents.filter(event => event.returnValues.origin === tx)
      if (edits.length >0) await article.initEdits(edits)
    }

    return article
  }

  async getVotes(tx){
    const [upvotes, downvotes] = await Promise.all([
      this.BBS.methods.upvotes(tx).call(),
      this.BBS.methods.downvotes(tx).call(),
    ])

    return upvotes - downvotes
  }

  async getVoted(tx){
    return await this.BBS.methods.voted(this.account, tx).call()
  }

  async getBanned(tx){
    return await this.BBSAdmin.methods.banned(tx).call()
  }

  async getComments(tx){
    const events = await this.BBS.getPastEvents('Replied', {fromBlock : FROMBLOCK})

    return events.filter((event) => {return tx == event.returnValues.origin}).map(async (event) => {
      const [comment] = await Promise.all([
        this.getComment(event),
      ])

      return [comment]
    })
  }

  async getComment(event){
    const comment = new Comment(event)
    await comment.init()

    return comment
  }

  getRegisterFee(_) {
    return this.BBSPB.methods.fee().call()
  }

  getRegisterHistory() {
    return this.BBSPB.getPastEvents('allEvents', {fromBlock: FROMBLOCK})
  }

  async checkIdAvailable(id) {
    // return !+(await this.BBSPB.methods.name2addr(web3.utils.fromAscii(id.toLowerCase())).call())
    try {
      // dry run is a dirty but works
      await this.BBSPB.methods.register(id).estimateGas({
        value: '0x7' + 'f'.repeat(63),
      })
      return true
    } catch (e) {
      return false
    }
  }

  async registerName(id, registerFee) {
    const gas = await this.dettBBSPB.methods.register(id).estimateGas({
      value: registerFee,
    })
    await awaitTx(this.dettBBSPB.methods.register(id).send({
      from: this.account,
      // FIXME: this gas estimation is WRONG, why?
      gas: gas * 2,
      value: registerFee,
      chainId: NETWORKID
    }))
    // handle the error elsewhere
  }

  getMetaByAddress(address) {
    return PostBase.getAuthorMeta(address)
  }

  async reply(tx, replyType, content) {
    if (![0, 1, 2].includes(+replyType))
      return alert('Wrong type of replyType.')

    if (!content.length)
      return alert('No content.')

    if (tx) {
      const gas = await this.dettBBS.methods.reply(tx, +replyType, content).estimateGas()
      try {
        if (!this.lock) {
          this.lock = true
          await this.dettBBS.methods.reply(tx, +replyType, content).send({ from: this.account, gas: gas, chainId: NETWORKID })
            .on('confirmation', (confirmationNumber, receipt) => {
              window.location.reload()
              this.lock = false
            })
        } else {
          alert('車速過快，要撞上分隔島了。')
        }
      } catch(e) {
        this.lock = false
        if (e.message.includes('insufficient funds')) {
          alert('手續費(Gas)不足，準備犁田了。')
        }
        else {
          console.log(e)
        }
      }
    }
  }

  async post(title, content){
    if (title.length > this.titleLength)
      return alert('Title\'s length is over 40 characters.')

    const post = '[' + title + ']' + content

    const gas = await this.dettBBS.methods.post(post).estimateGas()
    try {
      if (!this.lock) {
        this.lock = true
        await this.dettBBS.methods.post(post).send({ from: this.account, gas: gas, chainId: NETWORKID })
          .on('confirmation', (confirmationNumber, receipt) => {
            window.location = '/'
            this.lock = false
          })
      } else {
        alert('車速過快，要撞上分隔島了。')
      }
    } catch(e) {
      this.lock = false
      if (e.message.includes('insufficient funds')) {
        alert('手續費(Gas)不足，準備犁田了。')
      }
      else {
        console.log(e)
      }
    }
  }

  async edit(tx, title, content){
    if (title.length > this.titleLength)
      return alert('Title\'s length is over 40 characters.')

    const transaction = await this.rWeb3.eth.getTransaction(tx)

    if (this.account.toLowerCase() !== transaction.from.toLowerCase() && 
        this.account.toLowerCase() !== transaction.to.toLowerCase())
      return alert('You can not edit this article.')

    const post = '[' + title + ']' + content

    const gas = await this.dettBBS.methods.edit(tx, post).estimateGas()
    try {
      if (!this.lock) {
        this.lock = true
        await this.dettBBS.methods.edit(tx, post).send({ from: this.account, gas: gas, chainId: NETWORKID })
          .on('confirmation', (confirmationNumber, receipt) => {
            window.location = '/'
            this.lock = false
          })
      } else {
        alert('車速過快，要撞上分隔島了。')
      }
    } catch(e) {
      this.lock = false
      if (e.message.includes('insufficient funds')) {
        alert('手續費(Gas)不足，準備犁田了。')
      }
      else {
        console.log(e)
      }
    }
  }

  async getOriginalTx(shortLink){
    const hex = this.rWeb3.utils.padLeft(this.rWeb3.utils.toHex(shortLink), 64)
    const tx = await this.BBSCache.methods.links(hex).call()
    return tx
  }

  rewardAuthor(article, value) {
    const txObj = {
      from: this.account,
      to: article.author,
      value: this.rWeb3.utils.toWei(value),
      gas: 21000,
      achainId: NETWORKID,
    }


    const ok = this.confirmTx(txObj)
    if (!ok) {
      return Promise.reject(new Error('User denied to send transaction with seed.'))
    }
    
    return this.wWeb3.eth.sendTransaction(txObj)
  }

  confirmTx(txObj) {
    const { to, value } = txObj
    const message = `你確定要將你的 ${this.rWeb3.utils.fromWei(value)} TAN 轉帳到 ${to}？`
    return confirm(message)
  }
}

export default Dett
