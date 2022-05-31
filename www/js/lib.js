/**
 * This module contains common utilities used throughout the system
 * most critically the element prototype functions that enable
 * chaining.
 * @module lib
*/

/**
 * Allow chaining for common and other convenience calls to group element creation suff
 * by prefixing common prototype function with an "x".
 * @example
 * import { xmk, enableFunctionChaining } from './lib.js'
 * enableFunctionChaining()
 * function makeButton() {
 *   document.xmk('button')
 *     .xAddClass('menu')
 *     .xId('topmenu')
 *     .xTooltip('the top level menu')
 *     .xInnerHTML(`<img src="${ setup.menuImage }" alt="menu">`)
 *     .xAddEventListener('click', e => clicked(e))
 *     .xAppendToParent(document.body)
 */
export function enableFunctionChaining() {
    /**
     * Make an element.
     * @example
     * document.xmk('div').xId('me').xAddClass('x-foo')
     * @param {string} tagName The element tagname such as 'div'.
     * @param {object} options Additional options to pass to the underlying createElement() function.
     * @returns {element} The new element.
     * @global
     */
    HTMLDocument.prototype._xmk = function(tagName, options) {
        return this.createElement(tagName, options);
    }

    /**
     * Add a CSS class reference to an element.
     * Wrapper for classList.add().
     * @example
     * xmk('div').xAddClass('x-foo', 'x-bar').xAddClass('x-bar')
     * @param {string} className The CSS class name.
     * @returns {element} The caller element to enable chaining.
     * @global
     */
    Element.prototype.xAddClass = function(...className) {
        for (let i=0; i<className.length; i++) {
            let c = className[i]
            this.classList.add(c);
        }
        return this;
    }

    /**
     * Add a CSS class reference to an element.
     * Abbreviated name.
     * Wrapper for classList.add().
     * @example
     * xmk('div').xAddClass('x-foo', 'x-bar').xAddClass('x-bar')
     * @param {string} className The CSS class name.
     * @returns {element} The caller element to enable chaining.
     * @global
     */
    Element.prototype.xClass = function(...className) {
        for (let i=0; i<className.length; i++) {
            let c = className[i]
                this.classList.add(c);
            }
        return this;
    }

    /**
     * Remove a CSS class reference to an element.
     * Wrapper for classList.remove.
     * @example
     * let div = xmk('div').xAddClass('x-foo')
     * div.xRemoveClass('x-foo').xAddClass('x-bar')
     * @param {string} className The CSS class name.
     * @returns {element} The caller element to enable chaining.
     * @global
     */
    Element.prototype.xRemoveClass = function(...className) {
        for (let i=0; i<className.length; i++) {
            let c = className[i]
            this.classList.remove(c[i]);
        }
        return this;
    }

    /**
     * Add HTML to an element.
     * Wrapper for innerHTML.
     * @example
     * xmk('p').xInnerHTML('<i>text here</i>').xAddClass('x-foo')
     * @param {string} The HTML.
     * @returns {element} The caller element to enable chaining.
     * @global
     */
    Element.prototype.xInnerHTML = function(text) {
        this.innerHTML = text;
        return this;
    }

    /**
     * Add an event listener to an element.
     * Wrapper for addEventListener.
     * @example
     * xmk('p').xInnerHTML('fake button')
     *   .xAddEventListener('click', (e) => alert('clicked'))
     *   .xAddEventListener('change', (e) => alert('changed'))
     * @param {string} The event name.
     * @param {function} The event acrion.
     * @returns {element} The caller element to enable chaining.
     * @global
     */
    Element.prototype.xAddEventListener = function(eventName, eventAction) {
        this.addEventListener(eventName, eventAction);
        return this;
    }

    /**
     * Append this element to a parent node.
     * @example
     * xmk('p').xAppendToParent(xmk('div').xId('x-child')
     * @param {element} parent The parent node.
     * @returns {element} This object (the child).
     * @global
     */
    Element.prototype.xAppendToParent = function(parent) {
        parent.appendChild(this);
        return this;
    }

    /**
     * Append a list of one or more children to this node.
     * Wrapper for appendChild.
     * <p>
     * This is really useful. It is used to define the DOM structure
     * for dynamically created elements in a concise way.
     *
     * @example
     * xmk('div').xAddClass('container').xAppendChild(
     *   xmk('ol').xAppendChild(
     *      xmk('li').xInnerHTML('item 1'),
     *      xmk('li').xInnerHTML('item 2'),
     *      xmk('li').xInnerHTML('item 3'),
     *   )
     * )
     * @param {...child} var_args The child nodes.
     * @returns {element} This element (the parent).
     * @global
     */
    Element.prototype.xAppendChild = function(...child) {
        for (let i=0; i<child.length; i++) {
            let e = child[i]
            if (e) { // ignore null entries
                this.appendChild(e)
            }
        }
        return this;
    }

    /**
     * Synonym for xAppendToChild.
     */
    Element.prototype.xAppend = Element.prototype.xAppendChild


    /**
     * Prepend a list of one or more children to this node.
     * Wrapper for prependChild.
     * <p>
     * This is really useful. It is used to define the DOM structure
     * for dynamically created elements in a concise way.
     *
     * @example
     * xmk('div').xAddClass('container').xPrependChild(
     *   xmk('ol').xPrependChild(
     *      xmk('li').xInnerHTML('item 1'),
     *      xmk('li').xInnerHTML('item 2'),
     *      xmk('li').xInnerHTML('item 3'),
     *   )
     * )
     * @param {...child} var_args The child nodes.
     * @returns {element} This element (the parent).
     * @global
     */
    Element.prototype.xPrependChild = function(...child) {
        for (let i=0; i<child.length; i++) {
            let e = child[i]
            if (e) { // ignore null entries
                this.prepend(e)
            }
        }
        return this;
    }
    /**
     * Synonym for xPrepentToChild.
     */
    Element.prototype.xPrepend = Element.prototype.xPrependChild

    /**
     * Convenience function for defining the element id.
     * @example
     * xmk('div').xId('div-id')
     * @param {string} id The element id.
     * @returns {element} This element for chaining.
     * @global
     */
    Element.prototype.xId = function(id) {
        this.setAttribute('id', id);
        return this;
    }

    /**
     * Set an attribute on this element.
     * Wrapper for setAttribute.
     * @example
     * xmk('div').xAttr('id', 'div-id') // use .xId() instead for id's
     * @param {string} name The attribute name.
     * @param {string} value The attribute value.
     * @returns {element} This element for chaining.
     * @global
     */
    Element.prototype.xAttr = function(name, value) {
        this.setAttribute(name, value);
        return this;
    }

    /**
     * Define multiple attributes for this element.
     * @example
     * xmk('input')
     *   .xAttrs({
     *      'type': 'input',
     *       'placeholder': 'name',
     *       'required': 'true',
     *   })
     * @param {...kvpair} listOfAttrs The list of attribute name/value pairs.
     * @returns {element} This element for chaining.
     * @global
     */
    Element.prototype.xAttrs = function(listOfAttrs) {
        for (const attr in listOfAttrs) {
            let value = listOfAttrs[attr]
            this.setAttribute(attr, value);
        }
        return this;
    }

    /**
     * Set a namespace attribute on this element.
     * Wrapper for setAttributeNS.
     * @example
     * xmk('div').xAttrNS('bob','id', 'div-id')
     * @param {string} ns The attribute namespace.
     * @param {string} name The attribute name.
     * @param {string} value The attribute value.
     * @returns {element} This element for chaining.
     * @global
     */
    Element.prototype.xAttrNS = function(ns, name, value) {
        this.setAttributeNS(ns, name, value);
        return this;
    }

    /**
     * Set an attribute on this element if the flag is true.
     * Wrapper for setAttribute.
     * <p>
     * A better way to implement this would be to create
     * an xIf(..) prototype.
     * @example
     * xmk('div').xAttr('id', 'div-id')
     * @param {string} name The attribute name.
     * @param {string} value The attribute value.
     * @param {bool} flag The flag.
     * @returns {element} This element for chaining.
     * @global
     */
    Element.prototype.xAttrIfTrue = function(name, value, flag) {
        if (flag) {
            this.setAttribute(name, value);
        }
        return this;
    }

    /**
     * Define styles for this element.
     * @example
     * xmk('div').xStyle({
     *   color: 'red',
     *   backgroundColor: 'green',
     *   height: '32px',
     *   width: '32px',
     *   border: '1 solid blue',
     * })
     * @param {...kvpair} listOfStyles The list of style name/value pairs.
     * @returns {element} This element for chaining.
     * @global
     */
    Element.prototype.xStyle = function(listOfStyles) {
        for (const property in listOfStyles) {
            this.style[property] = listOfStyles[property];
        }
        return this;
    }

    /**
     * Convenience function that defines a tooltip for this element.
     * @example
     * xmk('div').xTooltip('the tip')
     * @param {string} tip The tooltip.
     * @returns {element} This element for chaining.
     * @global
     */
    Element.prototype.xTooltip = function(tip) {
        this.setAttribute('title', tip);
        return this;
    }
    /**
     * Remove all of the children from this element.
     * @example
     * element.xRemoveChildren()
     * @returns {element} This element for chaining.
     * @global
     */
    Element.prototype.xRemoveChildren = function() {
        let parent = this
        while (parent.firstChild) {
            parent.removeChild(parent.lastChild);
        }
    }

    /**
     * shorthand for QuerySelector.
     */
    Element.prototype.xGet = function (query) {
        return this.querySelector(query)
    }

    /**
     * shorthand for QuerySelectorAll.
     */
    Element.prototype.xGetN = function (query) {
        return this.querySelectorAll(query)
    }

    /**
     * Get the n-th parent.
     * @param {int} n The n-th parent
     * 1 == e.parentElement
     * 2 == e.parentElement.parentElement
     * 3 == e.parentElement.parentElement.parentElement
     */
    Element.prototype.xGetNthParent = function (n) {
        let p = this
        for(let i=0; i<n; i++) {
            p = p.parentElement
        }
        return p
    }

    /**
     * Get parent that contains one or more of the class names
     * @param {className} name the class names to match.
     */
    Element.prototype.xGetParentWithClass = function(...className) {
        let p = this
        while (p) {
            for (let i=0; i<className.length; i++) {
                let name = className[i]
                if (p.classList.contains(name)) {
                    return p
                }
            }
            p = p.parentElement
        }
        return null
    }

    /**
     * Get parent of a specific tagtype.
     * @param {className} name the class names to match.
     */
    Element.prototype.xGetParentOfType = function(...typeName) {
        let p = this
        while (p) {
            for (let i=0; i<typeName.length; i++) {
                let name = typeName[i]
                if (p.tagName.toLowerCase() === name) {
                    return p
                }
            }
            p = p.parentElement
        }
        return null
    }
}

/**
 * Shortcut for element creation in document._xmk().
 * @example
 * xmk('div').xId('me').xTooltip('do me stuff').xAddClass('x-foo')
 * @param {string} tagName The element tagname such as 'div'.
 * @param {object} options Additional options to pass to the underlying createElement() function.
 * @returns {element} The new element.
 * @global
 *
*/
export function xmk(tagName, options) {
  return document.createElement(tagName, options);
}


/**
 * Load a CSS stylesheet.
 * https://stackoverflow.com/questions/574944/how-to-load-up-css-files-using-javascript
 */
export function loadCSS( cssPath ) {
    // The link is how the DOM knows to find and insert the style sheet.
    let link = `<link rel=\"stylesheet\" href=\"${cssPath}\" />`
    document.getElementsByTagName("head")[0].insertAdjacentHTML(
    "beforeend",
    link);
}


/**
 * Convenience function to replace document.getElementById()
 */
export function xgetid(id) {
    let e = document.getElementById(id)
    if (!e) {
        console.log(`WARNING! element not found by id "${id}"`)
    }
    return e
}

/**
 * Convenience function to replace document.querySelector()
 */
export function xget(query) {
    // #foo == id "foo"
    // .foo == class "foo"
    let e = document.querySelector(query)
    if (!e) {
        console.log(`WARNING! element not found by query "${query}"`)
    }
    return e
}

/**
 * Convenience function to replace document.querySelectorAll()
 */
export function xgetn(query) {
    let e = document.querySelectorAll(query)
    if (!e) {
        console.log(`WARNING! element not found by query "${query}"`)
    }
    return e
}
