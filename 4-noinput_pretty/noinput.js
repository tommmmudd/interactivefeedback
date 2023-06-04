//console.clear();
// use compressor here for dynamics
// https://riptutorial.com/web-audio

let audioContext = new (window.AudioContext || window.webkitAudioContext)();
//const audioContext = new AudioContext()

// NOTE: to use audio worklet, need to be on local server (won't allow file:// access)
//audioContext.audioWorklet.addModule('matrix-processor.js')

// Basic Biquad stuck in bandpass mode
class Biquad
{
  constructor()
  {
    this.mode = "Bandpass"

    this.a0, this.a1, this.b2, this.b1, this.b2;
    this.filterFreq = 100;
    this.Q = 3;
    this.V = Math.pow(10, 1.0 / 20); // 1.0 was gain, now fixed
    this.sampleRate = 44100;

    this.targetFreq = this.filterFreq;
    this.transitionTimeInSamples = 50;
    this.transitionFreq = this.filterFreq;
    this.transitionCounter = this.transitionTimeInSamples; 

    this.gain = 1.5;

    this.prevX2 = 0; this.prevX1 = 0; this.prevY1 = 0; this.prevY2 = 0;
  }

  setFreq(newFreq)  { this.targetFreq = newFreq; this.transitionFreq = this.filterFreq; this.transitionCounter = 0; }
  //setFreq(freq) { this.filterFreq = freq; }
  setQ(_q) { this.Q = _q; }

  setGain(_gain) {this.gain = _gain;}
  setMode(_mode) {this.mode = _mode; }

  calcCoeffs()
  {
    
    let K = Math.tan(3.141592653589793 * this.filterFreq / this.sampleRate);

    if (this.mode == "Bandpass")
    {
      
      let norm = 1 / (1 + K / this.Q + K * K);
      this.a0 = K / this.Q * norm;
      this.a1 = 0;
      this.a2 = -this.a0;
      this.b1 = 2 * (K * K - 1) * norm;
      this.b2 = (1 - K / this.Q + K * K) * norm;
    }
    else
    {
      let V = Math.pow(10, 6.5*this.gain / 20.0);
      let norm = 1 / (1 + 1/this.Q * K + K * K);
      this.a0 = (1 + V/this.Q * K + K * K) * norm;
      this.a1 = 2 * (K * K - 1) * norm;
      this.a2 = (1 - V/this.Q * K + K * K) * norm;
      this.b1 = this.a1;
      this.b2 = (1 - 1/this.Q * K + K * K) * norm;
    }
  }
  
  process(inVal)
  {

    if (this.transitionCounter < this.transitionTimeInSamples)
    {
      this.filterFreq += (this.targetFreq - this.transitionFreq) / this.transitionTimeInSamples;
      this.transitionCounter += 1;
      this.calcCoeffs();
    }

    let y = this.a0*inVal  +  this.a1*this.prevX1  +  this.a2*this.prevX2  -  this.b1*this.prevY1  -  this.b2*this.prevY2;
    this.prevX2 = this.prevX1;
    this.prevX1 = inVal;
    this.prevY2 = this.prevY1;
    this.prevY1 = y;
    return y;  
  }
}




class Delay
{
  constructor()
  {
    this.buffer = [];
    this.size = 1000;
    this.readPos = 0;
    this.writePos = 0;

    for (let i=0; i<this.size; i++)
    {
      this.buffer[i] = 0.0;
    }

  }

  readVal()
  {
      // get current value at readPos
      let outVal = this.linearInterpolation(); //this.buffer[this.readPos];
      // increment readPos
      this.readPos ++;
      
      if (this.readPos >= this.size)
          this.readPos = 0;
   
      return outVal;
  }

  linearInterpolation()
  {
      // get buffer index
      let indexA = Math.floor(this.readPos);
      let indexB = indexA + 1;
      
      // wrap
      if (indexB >= this.size)
          indexB -= this.size;
      
      let valA = this.buffer[indexA];
      let valB = this.buffer[indexB];
      
      let remainder = this.readPos - indexA;
      
      let interpolatedValue = (1-remainder)*valA  +  remainder*valB;
      
      return interpolatedValue;
      
  }

  writeVal(inputSample)
  {
      // store current value at writePos
      this.buffer[this.writePos] = inputSample;
      
      // increment writePos
      this.writePos ++;
      
      if (this.writePos >= this.size)
          this.writePos = 0;
  }

  process(inputSample)
  {
    let outVal = this.readVal(inputSample);
    this.writeVal(inputSample);
    return outVal;
  }

  setDelayTimeInSamples(delayTimeInSamples)
  {
    if (delayTimeInSamples > this.size)
        delayTimeInSamples = this.size;
    
    if (delayTimeInSamples < 1)
        delayTimeInSamples = 1;
    
    this.readPos = this.writePos - delayTimeInSamples;
    
    // if readPos < 0, then add size to readPos
    if (this.readPos < 0)
        this.readPos += this.size;
  }
}



class ChannelStrip
{
  constructor()
  {
    this.filterFreqs = [90, 600, 5000];
    this.filterGains = [1, 1, 1];
    this.filters = []; 
    this.filterCount = 3;

    this.noiseGain = 1;

    for (let i=0; i<this.filterCount; i++)
    {
      this.filters[i] = new Biquad(); 
      this.filters[i].setMode("Peak");
      this.filters[i].setFreq(this.filterFreqs[i]);
      this.filters[i].setQ(0.2);
      this.filters[i].calcCoeffs();
    }

    this.delay = new Delay();
    //this.delay.setDelayTimeInSamples(Math.floor(Math.random()*4) + 1);
    this.delay.setDelayTimeInSamples(1);

  }

  process(inVal)
  {
    //let filtered = inVal
    let filtered = 0;
    for (let j=0; j<this.filterCount; j++)
    {
      // note - series filters, not parallel, so no +=
      // some noise in the system:
      let noise = this.noiseGain * 0.0005 * (Math.random() - 0.5)
      filtered += this.filterGains[j] * 2.0 *  this.filters[j].process(inVal + noise);
    }
    let delayed = this.delay.process(filtered);
    return delayed;  
  }

  setFilterN(n, newFreq) { this.filters[n] = newFreq;     this.filtes[n].calcCoeffs(); }

  setFilterGain(n, newGain)  {this.filters[n].setGain(newGain * newGain*1); this.filters[n].calcCoeffs(); }

  setNoiseGain(newGain)  {this.noiseGain = newGain;}
}



class AudioMatrix 
{
  constructor(context)
  {
    let blocksize = 256;
    let gain = 1;

    this.numChannels = 4;

    this.channels = [];

    // input gains for each channel
    this.inGains = [];
    this.outGains = [];
    // aux routing gains for each channel, to each channel
    this.fbMatrix = [];

    this.feedback = [];

    for (let i=0; i<this.numChannels; i++)
    {
      this.channels[i] = new ChannelStrip();
      this.inGains[i] = 1;
      this.outGains[i] = 0.05;
      this.feedback[i] = 0;
      this.fbMatrix[i] = [];
      for (let j=0; j<this.numChannels; j++)
      {
        this.fbMatrix[i][j] = 0;
      }
      this.fbMatrix[i][i] = 1.62;
    }

    //Creating nodes
    this.processor = context.createScriptProcessor(blocksize, 1, 2);
 
    let self = this;
    this.processor.onaudioprocess = function(audioProcessingEvent) {
      let inputBuffer = audioProcessingEvent.inputBuffer;
      let inputData = inputBuffer.getChannelData(0);

      let outputBuffer = audioProcessingEvent.outputBuffer;
      let outputDataL = outputBuffer.getChannelData(0);
      let outputDataR = outputBuffer.getChannelData(1);

      for (let i = 0; i < outputBuffer.length; i++) 
      {
        let outputSample = 0;

        for (let j=0; j<self.numChannels; j++)
        {
          // get input from fbMatrix
          let inputVal = inputData[i];
          for (let k=0; k<self.numChannels; k++)
          {
            inputVal += Math.atan(self.feedback[k] * self.fbMatrix[k][j]);
          }
          
          // process and store for feedback to other channels
          self.feedback[j] = self.outGains[j] * self.channels[j].process(inputVal * self.inGains[j]);
          
          // audible output
          outputSample += self.feedback[j];
        }

        outputDataL[i] = outputSample * 0.001;
        outputDataR[i] = outputSample * 0.001;
      }
      
    }
  }

  get input() {
    return this.processor;
  }

  connect(node) {
    this.processor.connect(node);
  }

  setFB(i, j, val) { this.fbMatrix[i][j] = val; }

  setEQ(chan, whichFilter, val) { this.channels[chan].setFilterGain(whichFilter, val); }

  setOutGain(chan, val) { this.outGains[chan] = val * 0.125; }

  setNoiseGain(newGain)  { for (let i=0; i<this.numChannels; i++) { this.channels[i].setNoiseGain(newGain);} }
}


class WhiteNoise {
  constructor(context) {
    let blocksize = 256;
    let gain = 0.1;
  
    //Creating nodes
    this.processor = context.createScriptProcessor(blocksize, 2, 2);
    
    let self = this;
    this.processor.onaudioprocess = function(audioProcessingEvent) {
      let outputBuffer = audioProcessingEvent.outputBuffer;

      for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
        let outputData = outputBuffer.getChannelData(channel);

        for (let sample = 0; sample < outputBuffer.length; sample++) {
          // make output equal to the same as the input
          outputData[sample] = gain *(Math.random() - 0.5);
        }
      }
      
    }
  }


  
  connect(node) {
    this.processor.connect(node);
  }
};

var EnvelopeGenerator = (function(context) {
  function EnvelopeGenerator() {
    this.attackTime = 0.001;
    this.releaseTime = 0.5;
  };

  EnvelopeGenerator.prototype.trigger = function() {
    console.log("triggered!!");
    now = context.currentTime;
    this.param.cancelScheduledValues(now);
    this.param.setValueAtTime(0, now);
    this.param.linearRampToValueAtTime(1, now + this.attackTime);
    this.param.linearRampToValueAtTime(0, now + this.attackTime + this.releaseTime);
  };

  EnvelopeGenerator.prototype.connect = function(param) {
    this.param = param;
  };

  return EnvelopeGenerator;
})(audioContext);

class VCA {
  constructor(context) {
    let blocksize = 256;
    this.gain = context.createGain();
    this.gain.gain.value = 0;
  
    //Creating nodes
    this.processor = context.createScriptProcessor(blocksize, 2, 2);
  }
  
  get gainVal() {
    return this.gain.gain;
  }
  get input() {
    return this.gain;
  }

  connect(node) {
    this.gain.connect(node);
  }
};

/*var VCA = (function(context) {
  function VCA() {
    this.gain = context.createGain();
    this.gain.gain.value = 0;
    this.input = this.gain;
    this.output = this.gain;
    this.amplitude = this.gain.gain;
  };

  VCA.prototype.connect = function(node) {
    if (node.hasOwnProperty('input')) {
      this.output.connect(node.input);
    } else {
      this.output.connect(node);
    };
  }

  return VCA;
})(audioContext);*/







let whiteNoise = new WhiteNoise(audioContext);

let vca = new VCA(audioContext);
var envelope = new EnvelopeGenerator;


let nimb = new AudioMatrix(audioContext)

let masterGain = audioContext.createGain();
masterGain.gain.value = 0.9;

var compressor = audioContext.createDynamicsCompressor();
compressor.threshold.value = -30;
compressor.knee.value = 0;
compressor.ratio.value = 4.5;
compressor.reduction.value = -20;
compressor.attack.value = 0;
compressor.release.value = 0.2;


/*

var delay = audioContext.createDelay(0.01);   // max delay time is 0.1 seconds
delay.delayTime.value = 0.005; // set to 5 milliseconds

var biquadFilter = audioContext.createBiquadFilter();
biquadFilter.type = "bandpass";
//biquadFilter.frequency = 400;
biquadFilter.Q.value = 0.8;
biquadFilter.gain.value = 1;



//let sourceNode = audioContext.createOscillator();
//sourceNode.type = 'sine';
//sourceNode.frequency.value = 261.6;
//sourceNode.detune.value = 0;

*/

//Connect the source to the speakers
whiteNoise.connect(vca.input);
envelope.connect(vca.gainVal);
vca.connect(nimb.input);
//vca.connect(masterGain);

nimb.connect(compressor);
compressor.connect(masterGain);
masterGain.connect(audioContext.destination)
//biquadFilter.connect(audioContext.destination);



//Make the sound audible for 100 ms
//whiteNoise.start();
//window.setTimeout(function() { sourceNode.stop(); }, 100);


// ENVELOPE BUTTON
//envButton.onmouseup = function() { console.log("released"); }



// NOISE SLIDER
const noiseSlider = document.getElementById("noise");
noiseSlider.addEventListener('input', function() 
{
  var noiseGain = ((this.value * this.value) * 16.0);
  nimb.setNoiseGain(noiseGain)
}, "false");


sends = [];
gains = [];
eqs = [];

for (let i=0; i<4; i++)
{
  sends[i] = [];
  for (let j=0; j<4; j++)
  {
    sends[i][j] = document.getElementById("channel"+(i+1)+""+(j+1)+"-send");
    sends[i][j].addEventListener('input', function()  {   nimb.setFB(i, j, this.value * this.value * 2);   }, "false");
  }

  gains[i] = document.getElementById("channel"+(i+1)+"-gain")
  gains[i].addEventListener('input', function()  
  {   nimb.setOutGain(i, this.value * this.value * this.value * 8);   }, "false");

  eqs[i] = [];
  for (let j=0; j<3; j++)
  {
    eqs[i][j] = document.getElementById("channel"+(i+1)+"-freq"+(j+1))
    eqs[i][j].addEventListener('input', function() 
    {  nimb.setEQ(i, 2-j, 4 * (this.value));}, "false");               
  }

}


preset1Gains = [0.3, 0.1, 0.3, 0.2];
preset1EQs = [[0.6, 0.2, 0.3], [0.8, 0.3, 0], [0.65, 0.2, 0.2], [0.55, 0, 0]];
preset1Sends = [[0.65, 0,0,0], [0, 0.6, 0, 0],[0,0,0.2,0], [0,0,0,0.6] ];
preset1Noise = 2.9;

preset2Gains = [0.2, 0.1, 0.2, 0.2];
preset2EQs = [[0.8, 0.7, 0.1], [0.2, 0.7, 0.7], [0.4, 0.7, 0.3], [0.8, 0.6, 0]];
preset2Sends = [[0, 0.25,0,0], [0.01, 0, 0.3, 0],[0,0, 0,0.2], [0.1,0,0,0] ];
preset2Noise = 4.5;

document.querySelector(".preset1").onmousedown = function() 
{
  console.log("Preset 1"); 
  loadPreset(preset1Gains, preset1EQs, preset1Sends, preset1Noise);
}
document.querySelector(".preset2").onmousedown = function() 
{
  console.log("Preset 2"); 
  loadPreset(preset2Gains, preset2EQs, preset2Sends, preset2Noise);
}

const randomButton = document.querySelector(".randomise");
randomButton.onmousedown = function() 
{
  console.log("Preset 1"); 
  randomGains = []; randomEQs = []; randomSends = []; randomNoise = Math.random() * Math.random() * 4.0;
  for (let i=0; i<4; i++)
  {
    randomGains[i] = Math.random()*Math.random();
    randomEQs[i] = [];
    randomSends[i] = [];
    for (let j=0; j<4; j++)
    {
      randomEQs[i][j] = Math.random()*Math.random() * 1.1;
      if (Math.random() < 0.4)
      {
        randomSends[i][j] = 0;
      }
      else
      {
        randomSends[i][j] = Math.random()*Math.random() * 1.1;
      }
      
    }

  }
  loadPreset(randomGains, randomEQs, randomSends, randomNoise);
}



// update both interface elements and actual values
function loadPreset(presetGains, presetEQs, presetSends, presetNoise)
{ 
  envelope.trigger(); 
  for (let i=0; i<4; i++)
  {

    gains[i].value = presetGains[i];
    nimb.setOutGain(i, gains[i].value * gains[i].value * gains[i].value * 8); 

    for (let j=0; j<4; j++)
    {
      sends[i][j].value = presetSends[i][j];
      nimb.setFB(i, j, sends[i][j].value * sends[i][j].value * 2);
    }

    for (let j=0; j<3; j++)
    {
      eqs[i][j].value = presetEQs[i][j];
      nimb.setEQ(i, 2-j, 4 * (eqs[i][j].value));
    }
  }

  noiseSlider.value = presetNoise;
  nimb.setNoiseGain((noiseSlider.value * noiseSlider.value) * 16.0)

}





// POWER BUTTON
const powerButton = document.querySelector(".control-power");

if (powerButton)
{
	console.log("power button exists");
	powerButton.addEventListener('click', function() {
	if (this.dataset.power === 'on') {
		audioContext.suspend();
		this.dataset.power = 'off';
		console.log("switching off");
    powerButton.innerHTML = "Turn Audio On";
    powerButton.style.background = "#efefef";
	} else if (this.dataset.power === 'off') {
		audioContext.resume();
		this.dataset.power = 'on';
    envelope.trigger();
		console.log("switching on");
    powerButton.innerHTML = "Turn Audio Off";
    powerButton.style.background = "#4CCF90";
	}
	this.setAttribute( "aria-checked", audioContext.state ? "false" : "true" );
	console.log(audioContext.state);
}, false);
}
else 
{
	console.log("power button dunt exist yet");
}

function switchOn() 
{
	audioContext.resume();
}




//============================================================
// DRAWING ANALYSER

var analyser = audioContext.createAnalyser();
masterGain.connect(analyser);
analyser.fftSize = 4096;
var bufferLength = analyser.frequencyBinCount;
var bufferToUse = bufferLength/6
console.log(bufferLength);
var dataArray = new Uint8Array(bufferToUse);

var canvas = document.querySelector('.visualizer');
var canvasCtx = canvas.getContext("2d");


//canvasCtx.fillStyle = 'rgb(200, 100, 50)';
//canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
function draw() {

  drawVisual = requestAnimationFrame(draw);

  analyser.getByteFrequencyData(dataArray);

  canvasCtx.fillStyle = 'rgb(239, 239, 239)';//  - this is #efefef?
  canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

  var barWidth = (canvas.width / bufferToUse) * 2.5;
  var barHeight;
  var x = 0;
  for(var i = 0; i < bufferToUse; i++) 
  {
    barHeight = dataArray[i]/2;
    barHeight = barHeight / 120.0;
    barHeight *= barHeight*barHeight;
    barHeight *= 75

    canvasCtx.fillStyle = 'rgb(50,50,'+(barHeight+50)+')';
    canvasCtx.fillRect(x, canvas.height - barHeight/2, barWidth, barHeight);

    x += barWidth + 1;
  }
};

draw();