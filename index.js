// IIFE - Immediately Invoked Function Expression
(function (code) {

    // The global jQuery object is passed as a parameter
    code(window.jQuery, window, document);

}(function ($, window, document) {

    // The $ is now locally scoped

    // Listen for the jQuery ready event on the document
    $(async function () {
        const queryParam = window.location.search.replace('?','')
        console.log(isAddress(queryParam))
        let address = isAddress(queryParam) ? queryParam : '0xa910f92acdaf488fa6ef02174fb86208ad7722ba'
        /* Loads up the UI with a default address */
        await populateUI(address)

    });


    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */
    /*                     API data Retrieval                      */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */

    /* Demo key - Get your API Key at amberdata.io/pricing
    * and place yours here! */
    const API_KEY = 'UAK000000000000000000000000demo0001'
    const w3d = new Web3Data(API_KEY)

    /**
     * The following methods construct the url and sends it off to axios via the
     * get method.
     * @param address
     */
    const getCurrentTokenTransfers = (address) => axios.get(`${BASE_URL}addresses/${address}/token-transfers${FILTERS}&includePrice=true`, config)
    const getHistoricalTokenBalances = (address, tokenAddress) => axios.get(`${BASE_URL}tokens/${tokenAddress}/holders/historical?timeFrame=30d&holderAddresses=${address}`, config)


    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */
    /*                        UI Building                          */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */

    /* TODO: the image things is pretty ugly find better sol if possible */
    const getTokenTemplate = (token) =>
        `<div class="token" data-address="${token.address}" data-name="${token.name}">
                <div class="logo item">
                    <img src="http://localhost:3000/api/token/${token.address}"  alt="">
<!--                    <img src="https://cdn.amberdata.io/images/tokens/${token.address}.png" onerror="this.src = hqx(blockies.create({ seed:address ,size: 8,scale: 1}),4).toDataURL()" alt="">-->
                </div>
                <div class="name item">
                    ${token.name} (${token.symbol})
                </div>
                <div class="value item">
                    Amount: ${round(getAmount(token), 2)}
                </div>
            </div>`

    const updateTokensList = (tokens, holderAddress) => {
        const tokenList = $('#tokens .list')

        // Remove old list and create new
        tokenList.empty()

        const token = $(`${tokens.map(token => getTokenTemplate(token)).join('')}`)

        tokenList.append(token)
        if (tokenList.length > 5) {
            tokenList.append(`
                <a style="color: #606060; margin:15px; 0"
                   href="https://amberdata.io/addresses/${holderAddress}/portfolio"
                   target="_blank">
                    View all token balances
                </a>`)
        }
    }

    const getPrice = (transfer) => {
        if (transfer.price && transfer.price.amount) {
            return  transfer.price.amount.total ? round(transfer.price.amount.total, 2) : '-'
        } else {
            return ' - '
        }
    }

    const getTransferTemplate = (transfer) =>
        `<div class="transfer">
            <div class="name">
                Token: ${transfer.name}
            </div>
            <div class="amount">
                Amount: ${round(getAmount(transfer), 2)}
            </div>
            <div class="price">
                Price:  $${getPrice(transfer)}
            </div>
            <div class="view">
                <a href="https://amberdata.io/transactions/${transfer.transactionHash}" target="_blank">View ></a>
            </div>
        </div>`

    const updateTransfersList = (transfers) => {
        const transferList = $('#token-transfers .list')
        const transferHtml = `${transfers.map(transfer => getTransferTemplate(transfer)).join('')}`
        transferList.append(transferHtml)
    }

    /**
     * Sends out data requests and updates the UI.
     * @param address the address to obtain data for
     */
    let populateUI = async (address) => {
        if (!isAddress(address)) return // Don't run unless valid ethereum address
        setLoading(true, 'transfers')
        setLoading(true)

        // TODO: Must be CONCURRENT -: let [balances, transfers] = Promise.all([, ])
        const balances = (await w3d.address.getTokens(address, {size: 5})).records

        /*
        let sortedBalances = sortBalances(balances.records)*/
        updateTokensList(balances, address)

        // Create a map: tokenAddress -> decimals
        const decimals = {}
        balances.map( (token) => { decimals[token.address] = token.decimals })

        const responses = await Promise.all(balances.map(token => w3d.token.getTokenHoldersHistorical(token.address, {holderAddresses: token.holder})))

        let data = responses.map(response => extractData(response).data)

        let timeSeriesData = {}
        for(let i = 0; i < data.length; i++) {
            timeSeriesData[balances[i].address] = data[i].map((token) => {
                token['t'] = new Date(token.timestamp)
                token['y'] = token[address] / Math.pow(10, balances[i].decimals)
                delete  token.timestamp
                delete  token[address]
                return token
            })
        }

        console.log({...timeSeriesData})

        let tokenElement = $("#tokens .list .token")
        let tokenAddress = tokenElement.data('address')
        let tokenName = tokenElement.data('name')

        instantiateChart(data[tokenAddress])

        /* Attach click handlers to tokens */
        createTokenListener(timeSeriesData)

        /* Select the first token in the list*/
        tokenElement[1].click()

        setLoading(false)
        const transfers = await w3d.address.getTokenTransfers(address, {includePrice: true, size: 50})
        console.log(transfers)
        updateTransfersList(transfers.records.slice(0, 50))
        setLoading(false, 'transfers')
        return {timeSeriesData}
    }

    const setLoading = (bool, section) => {
        if(section === 'transfers') {
            const loader = $('.loader')

            loader.css('opacity', bool ? '1' : '0')

            loader.one('webkitTransitionEnd otransitionend oTransitionEnd msTransitionEnd transitionend',
                function(e) {
                    loader.css('visibility', bool ? 'visible' : 'hidden')
                    $('#token-transfers .list').css('opacity', bool ? '0': '1')
                });
            if(bool === true) {
                $('#token-transfers .list').empty()
            }
        } else {
            const loader = $('.spinner')

            loader.css('opacity', bool ? '1' : '0')

            loader.one('webkitTransitionEnd otransitionend oTransitionEnd msTransitionEnd transitionend',
                function(e) {
                    loader.css('visibility', bool ? 'visible' : 'hidden')
                    $('.data').css('opacity', bool ? '0': '1')

                });
            $('#tokens .list').css('opacity', bool ? '0': '1')
        }
    }
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */
    /*                      Charts.js methods                      */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */
    let updateChart = async (data, tokenName) => {
        window.chart.data.datasets[0].data = data
        window.chart.data.datasets[0].label = tokenName
        const imgSrc = $(`*[data-name="${tokenName}"] .logo img`).attr("src")
        console.log(imgSrc)
        let vibrant = await Vibrant.from(imgSrc).getPalette();

        let vibRgb = vibrant.Vibrant || vibrant.LightVibrant || vibrant.DarkVibrant || vibrant.Muted || vibrant.LightMuted || vibrant.DarkMuted
        let muteRgb = vibrant.Muted || vibrant.LightMuted  || vibrant.DarkMuted || vibrant.DarkVibrant || vibrant.LightVibrant || vibrant.Vibrant

        window.chart.data.datasets[0].borderColor = `rgba(${vibRgb.get()[0]}, ${vibRgb.get()[1]}, ${vibRgb.get()[2]}, 1)`
        window.chart.data.datasets[0].backgroundColor = `rgba(${muteRgb.get()[0]}, ${muteRgb.get()[1]}, ${muteRgb.get()[2]}, 0.2)`

        window.chart.update();
    }

    const instantiateChart = data => {
        const deviceWidth = (window.innerWidth > 0) ? window.innerWidth : screen.width;
        if (window.chart) {
            window.chart.destroy()
        }
        Chart.defaults.global.defaultFontColor = 'white';
        let ctx = $('#holdings-chart')
        window.chart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Number of Tokens',
                    data: data,
                    backgroundColor: 'rgba(107, 107, 107, 0.2)',
                    borderColor: 'rgba(107, 107, 107, 1)',
                    fill: true,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: deviceWidth > 1000,
                aspectRatio: (deviceWidth > 1000 ? 2 : 1),
                title: {
                    display: true,
                    text: ''
                },
                scales: {
                    xAxes: [{
                        type: 'time',
                        distribution: 'series',
                        ticks: {
                            autoSkip: true
                        },
                        display: true,
                        gridLines: {
                            display: false,
                            drawBorder: false,
                            color: ['white']
                        },
                        scaleLabel: {
                            display: true,
                        }
                    }],
                    yAxes: [{
                        display: true,
                        gridLines: {
                            drawBorder: false,
                            display: false,
                            color: ['white']
                        },
                        scaleLabel: {
                            display: true,
                            labelString: 'Number of Tokens'
                        }
                    }]
                },
                tooltips: {
                    intersect: false,
                    mode: 'index',
                    backgroundColor: 'rgba(0, 0, 0, 1)'
                }
            }
        });
    }

    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */
    /*                          Listeners                          */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */

    /* Text Input listener
     * Watches the input field and will initiate search after an
     * address is entered.
     */
    let textInput = document.getElementById('address-input-field');
    let timeout = null; // Init a timeout variable to be used below
    textInput.onkeyup = (e) => {  // Listen for keystroke events

        // Clear the timeout if it has already been set.
        // This will prevent the previous task from executing
        // if it has been less than <MILLISECONDS>
        clearTimeout(timeout);

        // Make a new timeout set to go off in 800ms
        timeout = setTimeout(async () => {
            await populateUI(textInput.value.toLowerCase());
        }, 500);
    };

    /**
     * Creates and attaches listener onto the token elements. Triggers
     * updates to the chart upon token selection.
     * @param histHoldings contains time series historical token hodlings
     * @param chart reference to the chart.js instance
     * @return {void | jQuery}
     */
    const createTokenListener = histHoldings =>
    $("#tokens .list .token").click(function () {
        if(!$(this).is($('.selected'))) {
            $(this).siblings('.selected').toggleClass('selected')
            $(this).toggleClass('selected')
            let tokenAddress = $(this).data('address')
            let tokenName = $(this).data('name')
            console.log('selected token: ', tokenAddress)
            //TODO: Error handling
            console.log('selected tokens data: ', histHoldings[tokenAddress])
            updateChart(histHoldings[tokenAddress], tokenName)
        }
    });

    const tokenLogo = document.querySelector('.token .logo')
    console.log(tokenLogo)
    // tokenLogo.onerror = () => createBlocky

    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */
    /*                      Helper methods                         */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */

    const createBlocky = (el, address) => {
        console.log(el, address)
        // const squareIcon = document.getElementById('squareIcon');
        // squareIcon.style.backgroundImage = 'url(' + blockies.create({ seed:address ,size: 8,scale: 16}).toDataURL()+')'
        // // If you want rounded and diagonals
        // var roundIcon = document.getElementById('roundIcon');
        // roundIcon.style.backgroundImage = 'url(' + hqx(blockies.create({ seed:address ,size: 8,scale: 1}),4).toDataURL()+')'
    }

    let getAmount = (token) => token.amount / Math.pow(10, token.decimals)

    let truncHash = (hash) => `${hash.slice(0,10)}...`

    let round = (n, digits) => Number.parseFloat(n).toFixed(digits)

    /* Get's to the data we want. Makes things clearer.*/
    let extractData = (data) => data.payload

    /* Renames an objects keys */
    let renameKeys = (keysMap, obj) => Object
        .keys(obj)
        .reduce((acc, key) => ({
            ...acc,
            ...{[keysMap[key] || key]: obj[key]}
        }), {});

    /**
     * Returns sorted list of token balances
     * @param balances
     * @return {Int16Array}
     */
    let sortBalances = (balances) =>
        balances.sort((a, b) => {
            if (getAmount(a) > getAmount(b))
                return -1
            if (getAmount(a) < getAmount(b))
                return 1
            return 0
        }).slice(0, 10) // Limit top 5 results

    /**
     * Checks if the given string is an address
     *
     * @method isAddress
     * @param {String} address the given HEX address
     * @return {Boolean}
     */
    const isAddress = function (address) {
        if (!/^(0x)?[0-9a-f]{40}$/i.test(address)) {
            // check if it has the basic requirements of an address
            return false;
        } else if (/^(0x)?[0-9a-f]{40}$/.test(address) || /^(0x)?[0-9A-F]{40}$/.test(address)) {
            // If it's all small caps or all all caps, return true
            return true;
        } else {
            // Otherwise check each case
            return isChecksumAddress(address);
        }
    };

    /**
     * Checks if the given string is a checksummed address
     *
     * @method isChecksumAddress
     * @param {String} address the given HEX adress
     * @return {Boolean}
     */
    let isChecksumAddress = function (address) {
        // Check each case
        address = address.replace('0x', '');
        var addressHash = sha3(address.toLowerCase());
        for (var i = 0; i < 40; i++) {
            // the nth letter should be uppercase if the nth digit of casemap is 1
            if ((parseInt(addressHash[i], 16) > 7 && address[i].toUpperCase() !== address[i]) || (parseInt(addressHash[i], 16) <= 7 && address[i].toLowerCase() !== address[i])) {
                return false;
            }
        }
        return true;
    };

}));
