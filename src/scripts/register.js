
import {parseText, parseUser, web3ErrorToString} from './utils.js'

let dett = null
let registerFee = '0'

const render = (_account) => {
  if (_account){
    dett.getMetaByAddress(_account).then(meta => {
      const {name} = meta
      $('#main-content-nickname').text(name.length ? name : '(未註冊)')
      $('.member-zone').show()
    })
  } else {
    $('.member-zone').hide()
  }

  $('#main-content-address').text(_account)
}

// XXX: check rules originally checks against rules in order to merely update the view;
// but eventually also check for availability, and the view update is then async.

// returns if the nickname is valid
const checkRules = async nick => {
  const ruleCtrls = $('.--rule')
  ruleCtrls.removeClass('f1 f2 hl')

  if (!nick) {
    $('#register-ok').hide()
    $('#register-no').hide()
    return false
  }

  const isValid = [
    v => v.match(/^[A-Za-z0-9 ]{3,12}$/),
    v => !v.match(/(?:^0[Xx]|^ | $)/),
    v => !v.match(/^\d+$/),
    v => !v.match(/  +/),
  ].every((test, idx) => {
    if (test(nick)) {
      ruleCtrls.eq(idx).addClass('hl f2')
      return true
    }
    ruleCtrls.eq(idx).addClass('hl f1')
    return false
  })

  $('#register-submit').prop('disabled', !isValid)

  if (isValid) {
    // update UI for esti. cost
    const isAvailable = await dett.checkIdAvailable(nick)

    if (isAvailable) {
      $('#register-ok').show()
      $('#register-no').hide()
      // XXX: strange web3 bug. fee returns a bn object instead of a string
      $('#register-fee').text(`${dett.rWeb3.utils.fromWei(registerFee.toString())} TAN`)
    } else {
      $('#register-ok').hide()
      $('#register-no').show()
      $('#register-no').text('此ID已被註冊 :(')
      // XXX: revert; a bad pattern?
      $('#register-submit').prop('disabled', true)
    }
  } else {
    $('#register-ok').hide()
    $('#register-no').show()
    $('#register-no').text('無法使用此ID :(')
  }

  return isValid
}

const doNewRegister = async nick => {
  if (!await checkRules(nick) ||
      // do not rely on view state
      !await dett.checkIdAvailable(nick)) {
    // failed pre-check
    return
  }
  await dett.registerName(nick, registerFee)
}

const main = async (_dett) => {
  dett = _dett

  if (dett.account) {
    await render(dett.account)
  }
  dett.on('account', render)

  const elNickname = $('#register-nickname')
  elNickname.on('input', evt => checkRules($(evt.currentTarget).val()))
  $('#register-submit').click(async () => {
    try {
      await doNewRegister(elNickname.val())
    } catch (err) {
      console.log(err)
      alert('註冊失敗\n' + web3ErrorToString(err))
      return
    }
    alert('註冊成功！')
    elNickname.val('')
    window.location.reload()
  })

  registerFee = await dett.getRegisterFee()
  checkRules(elNickname.val())

  const history = await dett.getRegisterHistory()
  console.log('name history', history)
}

_layoutInit().then(main)
